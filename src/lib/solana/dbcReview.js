/** Single-use review -> fresh verification -> Phantom -> durable submission.
 * Private mint material lives only in a WeakMap and is never returned/persisted.
 */
import { Buffer } from 'buffer';
import { EventParser } from '@coral-xyz/anchor';
import { ComputeBudgetProgram, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { browserActivity } from './lifecycle.js';
import { confirmTransactionHttp, encodeSignature } from './transactions.js';
import { requireTransactionFunds } from './preflight.js';
import { DBC_ROUTE, KYDOS, TREASURY, LAUNCH_SIZE, dbcAddresses, dbcProgram,
  dbcLaunchInstruction, dbcFeeInstruction, recipientAta, readDbcLaunch, readDbcPositions,
  validateDbcRelease, verifyDbcRelease, withDbcRecipients, sha256 } from './dbcBrowser.js';

const prepared = new WeakMap();
const check = (ok, message) => { if (!ok) throw new Error(message); };
const integer = (value, name) => {
  check(Number.isSafeInteger(value) && value >= 0, `${name} is not a safe RPC integer`);
  return BigInt(value);
};
const walletKey = wallet => {
  check(wallet?.publicKey && typeof wallet.signTransaction === 'function', 'Connect a signing Phantom wallet first');
  return new PublicKey(wallet.publicKey);
};
const instructionDigest = transaction => sha256(Buffer.from(JSON.stringify(transaction.instructions.map(ix => ({
  program: ix.programId.toBase58(), data: Buffer.from(ix.data).toString('base64'),
  keys: ix.keys.map(k => [k.pubkey.toBase58(), k.isSigner, k.isWritable]),
})))));

async function build(connection, intent, payer, release) {
  if (intent.operation === 'create') {
    const instruction = await dbcLaunchInstruction({ connection, payer, config: release.config, ...intent });
    const transaction = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }), instruction);
    return { transaction, record: null };
  }
  check(intent.operation === 'settle' || intent.operation === 'bonding', 'Invalid DBC operation');
  const record = await readDbcLaunch(connection, intent.mint, release.config);
  if (intent.operation === 'settle') {
    const positions = await readDbcPositions(connection, record);
    check(positions.some(p => p.nft === intent.nft), 'Position is not fully locked in Kydos fee custody');
  }
  const instruction = await dbcFeeInstruction({ connection, payer, record,
    source: intent.operation === 'settle' ? 'damm' : 'bonding', nft: intent.nft });
  const transaction = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
    ...withDbcRecipients(instruction, payer, record.creator).instructions);
  return { transaction, record };
}

async function estimate(connection, transaction, intent, payer, release, record) {
  const fee = await connection.getFeeForMessage(transaction.compileMessage(), 'confirmed');
  const networkFeeLamports = integer(fee?.value, 'Network fee');
  const balanceLamports = integer(await connection.getBalance(payer, 'confirmed'), 'Wallet balance');
  const rent = async size => integer(await connection.getMinimumBalanceForRentExemption(size, 'confirmed'), 'Account rent');
  let rentLamports = 0n, metadataFeeLamports = 0n;
  if (intent.operation === 'create') {
    // Pinned SPL DBC: mint, Kydos registry, virtual pool, two token vaults, metadata.
    // The exact approved config has poolCreationFee=0 (differential SDK test).
    for (const size of [82, LAUNCH_SIZE, 424, 165, 165, 679]) rentLamports += await rent(size);
    metadataFeeLamports = await rent(1308) + 5440n;
  } else {
    const a = dbcAddresses(intent.mint, release.config);
    const targets = new Set([a.baseFees, a.quoteFees, recipientAta(record.creator), recipientAta(TREASURY)].map(k => k.toBase58()));
    // Budget every possible custody/recipient account even if it currently exists.
    // A recipient can close its ATA while Phantom is open; unused rent stays with
    // the sponsor, rather than allowing that race to exceed the reviewed budget.
    rentLamports = BigInt(targets.size) * await rent(165);
  }
  const requiredLamports = networkFeeLamports + rentLamports + metadataFeeLamports;
  const shortfallLamports = requiredLamports > balanceLamports ? requiredLamports - balanceLamports : 0n;
  return Object.freeze({ networkFeeLamports, rentLamports, metadataFeeLamports, requiredLamports, balanceLamports,
    shortfallLamports, sufficient: shortfallLamports === 0n });
}

async function simulate(connection, transaction, intent) {
  const simulation = await connection.simulateTransaction(new VersionedTransaction(transaction.compileMessage()),
    { commitment: 'confirmed', sigVerify: false });
  check(simulation?.value?.err === null, `DBC simulation failed: ${JSON.stringify(simulation?.value?.err ?? 'No result')}. Nothing was submitted.`);
  if (intent.operation === 'create') return null;
  const parser = new EventParser(KYDOS, dbcProgram(connection).coder);
  const events = [...parser.parseLogs(simulation.value.logs || [])].filter(e => e.name === 'dbcFeesSettled');
  check(events.length === 1, 'Simulation did not return one authenticated Kydos settlement event');
  const e = events[0].data;
  check(new PublicKey(e.mint).equals(new PublicKey(intent.mint)) && e.source === (intent.operation === 'settle' ? 1 : 0), 'Unexpected settlement event');
  const amounts = Object.fromEntries(['baseBurned', 'quoteReceived', 'creatorQuote', 'kydosQuote', 'quoteDust']
    .map(key => [key, BigInt(e[key].toString())]));
  check(amounts.baseBurned > 0n || amounts.quoteReceived > 0n, 'No new trading fees are claimable. No wallet approval is needed.');
  if (intent.operation === 'settle') check(amounts.creatorQuote === amounts.kydosQuote, 'Unequal simulated quote payouts');
  else check(amounts.creatorQuote === 0n && amounts.baseBurned === 0n && amounts.kydosQuote === amounts.quoteReceived, 'Invalid bonding fee payout');
  check(amounts.quoteDust <= 1n, 'Invalid simulated rounding dust');
  return Object.freeze(amounts);
}

export async function prepareDbcReview({ connection, wallet, release: input, operation,
  name, symbol, metadataUri, mint, nft, initialBuyLamports = 0n }) {
  check(['create', 'settle', 'bonding'].includes(operation), 'Invalid DBC operation');
  check(initialBuyLamports === 0n, 'DBC initial purchases are not yet enabled');
  const payer = walletKey(wallet), release = await verifyDbcRelease(connection, input);
  const mintKeypair = operation === 'create' ? Keypair.generate() : null;
  const intent = Object.freeze(operation === 'create'
    ? { operation, mint: mintKeypair.publicKey.toBase58(), name, symbol, metadataUri, initialBuyLamports }
    : { operation, mint: new PublicKey(mint).toBase58(), ...(operation === 'settle' ? { nft: new PublicKey(nft).toBase58() } : {}) });
  const built = await build(connection, intent, payer, release);
  const latest = await connection.getLatestBlockhash('confirmed');
  built.transaction.feePayer = payer; built.transaction.recentBlockhash = latest.blockhash;
  built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  const costs = await estimate(connection, built.transaction, intent, payer, release, built.record);
  requireTransactionFunds({ chain: release.genesisHash, payer, costs });
  const preview = await simulate(connection, built.transaction, intent);
  check(await connection.getGenesisHash() === release.genesisHash, 'RPC network changed while reviewing');
  const review = Object.freeze({ ...intent, payer: payer.toBase58(), chain: release.genesisHash, config: release.config,
    creator: built.record?.creator.toBase58() ?? payer.toBase58(), treasury: TREASURY.toBase58(), costs, preview });
  prepared.set(review, { intent, mintKeypair, release, digest: await instructionDigest(built.transaction) });
  return review;
}
export function discardDbcReview(review) { if (review) prepared.delete(review); }

export async function submitDbcReview({ connection, wallet, review, release: input,
  activity = browserActivity(), onStage = _stage => {}, ensureCurrent = () => {} }) {
  const internal = prepared.get(review);
  check(internal, 'Review expired or already used. Prepare a fresh DBC review.');
  prepared.delete(review); // Never reuse private mint material after a send attempt.
  const { intent, mintKeypair, release, digest } = internal, payer = walletKey(wallet);
  check(payer.toBase58() === review.payer, 'Wallet changed; review again');
  check(JSON.stringify(validateDbcRelease(input)) === JSON.stringify(release), 'Release changed; review again');
  const operation = intent.operation === 'create' ? 'create' : `dbc-${intent.operation}`;
  const scope = { wallet: review.payer, chain: review.chain, program: KYDOS.toBase58(), operation,
    conflict: intent.operation === 'create' ? 'create' : `fees:${intent.mint}` };
  // Only public fields enter the shared crash-recovery journal.
  const metadata = { protocol: DBC_ROUTE, operation, mint: intent.mint, config: release.config,
    ...(intent.nft ? { nft: intent.nft } : {}) };
  const stage = value => { try { onStage(value); } catch { /* UI must not corrupt submission tracking. */ } };
  return activity.execute(scope, metadata, async save => {
    stage('verifying'); ensureCurrent();
    await verifyDbcRelease(connection, release);
    const built = await build(connection, intent, payer, release), tx = built.transaction;
    check(await instructionDigest(tx) === digest, 'Transaction changed after review');
    const latest = await connection.getLatestBlockhash('confirmed');
    tx.feePayer = payer; tx.recentBlockhash = latest.blockhash;
    tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const costs = await estimate(connection, tx, intent, payer, release, built.record);
    requireTransactionFunds({ chain: release.genesisHash, payer, costs });
    check(costs.requiredLamports <= review.costs.requiredLamports, 'Transaction cost increased. Review again before signing.');
    stage('simulating'); await simulate(connection, tx, intent);
    ensureCurrent(); check(walletKey(wallet).equals(payer), 'Wallet changed before signing');
    check(await connection.getGenesisHash() === review.chain, 'Network changed before signing');
    if (mintKeypair) tx.partialSign(mintKeypair);
    const message = Buffer.from(tx.serializeMessage());
    save({ state: 'signing', ...latest, messageBase64: message.toString('base64') });
    stage('signing'); const signed = await wallet.signTransaction(tx);
    ensureCurrent(); check(walletKey(wallet).equals(payer), 'Wallet changed during signing');
    check(Buffer.from(signed.serializeMessage()).equals(message), 'Wallet changed the reviewed transaction');
    const wire = signed.serialize(), signature = encodeSignature(signed.signature);
    save({ state: 'signed', signature });
    // A program upgrade while Phantom was open invalidates approval, not the policy.
    await verifyDbcRelease(connection, release); ensureCurrent();
    save({ state: 'submitting' }); stage('submitting');
    const returned = await connection.sendRawTransaction(wire, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 });
    check(returned === signature, 'RPC returned a different signature');
    stage('confirming'); const confirmed = await confirmTransactionHttp(connection, { signature, ...latest });
    if (confirmed.value.err) {
      save({ state: 'failed', message: 'Confirmed on-chain failure' });
      throw new Error('DBC transaction failed on chain');
    }
    save({ state: 'confirmed', message: 'DBC transaction confirmed on chain' });
    return Object.freeze({ mint: intent.mint, signature, operation });
  });
}
