// Transaction assembly and mocked transport only. No validator, wallet extension or chain writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import { Keypair, ComputeBudgetProgram } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, ACCOUNT_SIZE, getAssociatedTokenAddress } from '@solana/spl-token';
import { buildCreateTransaction, PROGRAM_ID, quoteInitialBuy } from '../../src/lib/solana/client.js';
import { prepareLaunchReview, submitReviewedLaunch, LAUNCH_NETWORKS } from '../../src/lib/solana/launchReview.js';
import { encodeSignature } from '../../src/lib/solana/transactions.js';

const payer = Keypair.generate();
const wallet = { publicKey: payer.publicKey };
const args = { wallet, name: 'Kydos', symbol: 'KYDO', metadataUri: 'ipfs://bafybeigz2d3example', initialBuyLamports: 1_000_000_000n };
const chain = Object.keys(LAUNCH_NETWORKS)[1];
const activity = { execute: async (_scope, _metadata, action) => action(() => {}) };
function rpc() {
  return {
    getGenesisHash: async () => chain,
    getAccountInfo: async () => ({ executable: true }),
    getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 999 }),
    getFeeForMessage: async () => ({ value: 10_000 }),
    getBalance: async () => 200_000_000_000,
    getMinimumBalanceForRentExemption: async size => size * 10,
    getSignatureStatuses: async () => ({ value: [{ err: null, confirmationStatus: 'confirmed' }] }),
    sendRawTransaction: async () => { throw new Error('Unexpected broadcast'); },
  };
}

test('initial buy is initialize, creator ATA and buy in one transaction with two signers', async () => {
  const { transaction, mint, quote } = await buildCreateTransaction({ ...args, connection: rpc() });
  assert.deepEqual(transaction.instructions.map(ix => ix.programId.toBase58()),
    [ComputeBudgetProgram.programId, PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, PROGRAM_ID].map(key => key.toBase58()));
  const [budget, create, ata, buy] = transaction.instructions;
  assert.equal(budget.data.readUInt32LE(1), 600_000);
  assert.deepEqual([...create.data.subarray(0, 8)], [175, 175, 109, 31, 13, 152, 155, 237]);
  assert.deepEqual([...buy.data.subarray(0, 8)], [102, 6, 61, 18, 1, 218, 235, 234]);
  const creatorAta = await getAssociatedTokenAddress(mint.publicKey, payer.publicKey);
  assert.ok(ata.keys.some(k => k.pubkey.equals(creatorAta)));
  assert.ok(buy.keys.some(k => k.pubkey.equals(creatorAta)));
  assert.equal(buy.data.readBigUInt64LE(8), args.initialBuyLamports);
  assert.equal(buy.data.readBigUInt64LE(16), quote.minOut);
  assert.equal(quote.output, 34_277_831_558_567n);
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
  assert.equal(transaction.compileMessage().header.numRequiredSignatures, 2);
});

test('zero buy preserves creation only; invalid amounts and slippage rejected', async () => {
  const { transaction } = await buildCreateTransaction({ ...args, connection: rpc(), initialBuyLamports: 0n });
  assert.equal(transaction.instructions.length, 2);
  for (const amount of [-1n, '0.1', 1, 1n << 64n]) assert.throws(() => quoteInitialBuy(amount));
  for (const bps of [-1, 10000, 0.5]) assert.throws(() => quoteInitialBuy(1n, bps));
  assert.equal(quoteInitialBuy(100_000_000_000n).acceptedInput, 85_863_999_048n);
});

test('review includes creator ATA rent and full authorized buy input, retains the same mint for one signing/broadcast', async () => {
  const connection = rpc();
  const plain = await prepareLaunchReview({ ...args, connection, initialBuyLamports: 0n });
  const { built, review } = await prepareLaunchReview({ ...args, connection });
  assert.equal(review.costs.requiredLamports - plain.review.costs.requiredLamports, args.initialBuyLamports + BigInt(ACCOUNT_SIZE * 10));
  let signs = 0, sends = 0;
  const stages = [];
  const signer = { ...wallet, signTransaction: async tx => {
    signs++;
    assert.ok(tx.signatures.find(s => s.publicKey.equals(built.mint.publicKey)).signature);
    tx.partialSign(payer); return tx;
  } };
  connection.sendRawTransaction = async wire => { sends++; assert.ok(wire.length < 1233); return encodeSignature(built.transaction.signature); };
  const result = await submitReviewedLaunch({ connection, wallet: signer, built, review, activity, onStage: s => stages.push(s) });
  assert.equal(result.mint, review.mint);
  assert.equal(signs, 1); assert.equal(sends, 1);
  assert.deepEqual(stages, ['preparing', 'signing', 'submitting', 'confirming']);
});

test('changed wallet, message, network, fees and unavailable programs prevent signing', async () => {
  for (const change of ['wallet', 'message', 'chain', 'fee', 'program', 'balance']) {
    const connection = rpc();
    const { built, review } = await prepareLaunchReview({ ...args, connection });
    let signs = 0, sends = 0;
    const signer = { ...wallet, signTransaction: async () => { signs++; } };
    connection.sendRawTransaction = async () => { sends++; };
    if (change === 'wallet') signer.publicKey = Keypair.generate().publicKey;
    if (change === 'message') built.transaction.instructions[1].data = Buffer.from([1]);
    if (change === 'chain') connection.getGenesisHash = async () => Object.keys(LAUNCH_NETWORKS)[0];
    if (change === 'fee') connection.getFeeForMessage = async () => ({ value: 10_001 });
    if (change === 'program') connection.getAccountInfo = async () => null;
    if (change === 'balance') connection.getBalance = async () => 0;
    await assert.rejects(submitReviewedLaunch({ connection, wallet: signer, built, review, activity }));
    assert.equal(signs, 0, change); assert.equal(sends, 0, change);
  }
  await assert.rejects(prepareLaunchReview({ ...args, connection: { ...rpc(), getGenesisHash: async () => 'unknown' } }), /not a supported/);
});

test('maximum valid text fits as a single create-and-buy packet; wallet rejection never broadcasts', async () => {
  const connection = rpc();
  const { built, review } = await prepareLaunchReview({ ...args, connection, name: 'N'.repeat(32), symbol: 'T'.repeat(10), metadataUri: 'https://x.test/' + 'a'.repeat(185) });
  assert.ok(built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).length <= 1232);
  let sends = 0;
  connection.sendRawTransaction = async () => { sends++; };
  await assert.rejects(submitReviewedLaunch({ connection, built, review, activity, wallet: { ...wallet,
    signTransaction: async () => { throw Object.assign(new Error('User rejected'), { code: 4001 }); },
  } }), /rejected/);
  assert.equal(sends, 0);
});
