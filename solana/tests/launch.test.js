// Transaction assembly and mocked transport only. No validator, wallet extension or chain writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import { Keypair, ComputeBudgetProgram } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, ACCOUNT_SIZE, getAssociatedTokenAddress } from '@solana/spl-token';
import { buildCreateTransaction, PROGRAM_ID, quoteInitialBuy } from '../../src/lib/solana/client.js';
import { prepareLaunchReview, submitReviewedLaunch, LAUNCH_NETWORKS } from '../../src/lib/solana/launchReview.js';
import { encodeSignature } from '../../src/lib/solana/transactions.js';
import { createPhantomSigner } from '../../src/lib/solana/phantom.js';
import { createActivityStore } from '../../src/lib/solana/lifecycle.js';

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
    simulateTransaction: async () => ({ value: { err: null, logs: [] } }),
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
  let simulatedMessage;
  connection.simulateTransaction = async (tx, config) => {
    assert.deepEqual(config, { commitment: 'confirmed', sigVerify: false });
    assert.equal(tx.message.version, 'legacy');
    simulatedMessage = Buffer.from(tx.message.serialize());
    assert.equal(signs, 0); assert.equal(sends, 0);
    return { value: { err: null } };
  };
  const provider = { isPhantom: true, publicKey: payer.publicKey, signTransaction: async tx => {
    signs++;
    assert.deepEqual(Buffer.from(tx.serializeMessage()), simulatedMessage);
    assert.ok(tx.signatures.find(s => s.publicKey.equals(built.mint.publicKey)).signature);
    tx.partialSign(payer); return tx;
  } };
  const signer = { ...wallet, ...createPhantomSigner(provider, payer.publicKey) };
  connection.sendRawTransaction = async wire => { sends++; assert.ok(wire.length < 1233); return encodeSignature(built.transaction.signature); };
  const result = await submitReviewedLaunch({ connection, wallet: signer, built, review, activity, onStage: s => stages.push(s) });
  assert.equal(result.mint, review.mint);
  assert.equal(signs, 1); assert.equal(sends, 1);
  assert.deepEqual(stages, ['preparing', 'simulating', 'signing', 'submitting', 'confirming']);
});

function journal() {
  const data = new Map();
  return createActivityStore({ storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) },
    locks: { request: async (_name, _options, run) => run({}) }, id: () => 'test-launch' });
}

test('unfunded launch identifies wallet and actual RPC network before simulation or Phantom', async () => {
  const connection = rpc();
  const { built, review } = await prepareLaunchReview({ ...args, connection });
  connection.getBalance = async () => 0;
  let signs = 0, simulations = 0, sends = 0;
  connection.simulateTransaction = async () => { simulations++; };
  connection.sendRawTransaction = async () => { sends++; };
  const store = journal();
  await assert.rejects(submitReviewedLaunch({ connection, built, review, activity: store,
    wallet: { ...wallet, signTransaction: async () => { signs++; } },
  }), error => error.state === 'not-submitted' && error.message.includes(payer.publicKey.toBase58()) &&
    error.message.includes('Solana devnet') && error.message.includes('0 native SOL'));
  assert.equal(signs, 0); assert.equal(simulations, 0); assert.equal(sends, 0);
  assert.equal(store.read()[0].state, 'not-submitted');
});

test('failed or unavailable pre-sign simulation stops before Phantom and leaves launch retryable', async () => {
  for (const failure of ['AccountNotFound', 'InsufficientFundsForFee', 'BlockhashNotFound', { InstructionError: [1, { Custom: 1 }] }, 'transport', 'missing-result', 'chain-changed']) {
    const connection = rpc();
    const { built, review } = await prepareLaunchReview({ ...args, connection });
    let signs = 0, sends = 0;
    connection.simulateTransaction = async () => {
      if (failure === 'transport') throw new Error('Simulation RPC unavailable');
      if (failure === 'missing-result') return {};
      if (failure === 'chain-changed') { connection.getGenesisHash = async () => Object.keys(LAUNCH_NETWORKS)[0]; return { value: { err: null } }; }
      return { value: { err: failure, logs: [] } };
    };
    connection.sendRawTransaction = async () => { sends++; };
    const store = journal();
    await assert.rejects(submitReviewedLaunch({ connection, built, review, activity: store,
      wallet: { ...wallet, signTransaction: async () => { signs++; } },
    }), error => {
      assert.equal(error.state, 'not-submitted');
      if (failure === 'AccountNotFound') {
        assert.match(error.message, /Solana simulation.*funded fee payer/);
        assert.match(error.message, /Solana devnet/);
        assert.ok(error.message.includes(payer.publicKey.toBase58()));
      }
      return true;
    });
    assert.equal(signs, 0); assert.equal(sends, 0);
    assert.equal(store.read()[0].state, 'not-submitted');
  }
});

test('Phantom funding failure after successful app simulation reports the checked wallet/network without sending', async () => {
  for (const error of [new Error('Attempt to debit an account but found no record of a prior credit.'),
    Object.assign(new Error('Unexpected error'), { data: { err: 'AccountNotFound' } })]) {
    const connection = rpc();
    const { built, review } = await prepareLaunchReview({ ...args, connection });
    let sends = 0;
    connection.sendRawTransaction = async () => { sends++; };
    const store = journal();
    await assert.rejects(submitReviewedLaunch({ connection, built, review, activity: store,
      wallet: { ...wallet, signTransaction: async () => { throw error; } },
    }), result => result.state === 'not-submitted' && /Phantom could not find a funded fee payer/.test(result.message) &&
      /Solana devnet/.test(result.message) && result.message.includes(payer.publicKey.toBase58()));
    assert.equal(sends, 0);
  }
});

test('Phantom rejects a different payer and detects account changes while its popup is open', async () => {
  for (const change of ['payer', 'before', 'during', 'disconnect']) {
    const connection = rpc();
    const { built, review } = await prepareLaunchReview({ ...args, connection });
    let signs = 0, sends = 0;
    const provider = { isPhantom: true, publicKey: payer.publicKey, signTransaction: async tx => {
      signs++; tx.partialSign(payer);
      provider.publicKey = change === 'disconnect' ? null : Keypair.generate().publicKey;
      return tx;
    } };
    const signer = { ...wallet, ...createPhantomSigner(provider, payer.publicKey) };
    connection.sendRawTransaction = async () => { sends++; };
    if (change === 'payer') {
      built.transaction.feePayer = built.mint.publicKey;
      await assert.rejects(signer.signTransaction(built.transaction), /fee payer/);
    } else {
      if (change === 'before') provider.publicKey = Keypair.generate().publicKey;
      await assert.rejects(submitReviewedLaunch({ connection, built, review, activity: journal(), wallet: signer }), /account changed or disconnected/);
    }
    assert.equal(signs, ['during', 'disconnect'].includes(change) ? 1 : 0);
    assert.equal(sends, 0);
  }
});

test('wallet message mutation and missing mint signature are rejected before broadcast', async () => {
  for (const change of ['message', 'mint-signature']) {
    const connection = rpc();
    const { built, review } = await prepareLaunchReview({ ...args, connection });
    let sends = 0;
    connection.sendRawTransaction = async () => { sends++; };
    await assert.rejects(submitReviewedLaunch({ connection, built, review, activity: journal(), wallet: { ...wallet,
      signTransaction: async tx => {
        if (change === 'message') tx.instructions[1].data = Buffer.from([1]);
        tx.partialSign(payer);
        if (change === 'mint-signature') tx.signatures.find(s => s.publicKey.equals(built.mint.publicKey)).signature = null;
        return tx;
      },
    } }), change === 'message' ? /Wallet changed the transaction/ : /Signature verification failed/);
    assert.equal(sends, 0);
  }
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
