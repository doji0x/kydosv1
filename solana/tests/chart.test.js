import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BorshCoder } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { Keypair } from '@solana/web3.js';
import { decodeKydosTransaction, uniqueEvents, chartTrade, eventOrderKey } from '../../base44/shared/solanaEvents.js';
import { readRawPage, readEventWindow, advanceIndexState, persistEvents } from '../../base44/shared/solanaIndex.js';
import { normalizeHeliusTrade } from '../../base44/shared/heliusSolanaTrades.js';
import { PROGRAM_ADDRESS, SOL_MINT } from '../../base44/shared/solanaProtocol.js';
import { mergeTrades, feedHealth } from '../../src/lib/solana/chartFeed.js';
import { bucketTrades, canUpdateLastCandle } from '../../src/lib/solana/candles.js';
import { deriveMarketMetrics, formatPrice } from '../../src/lib/solana/marketMetrics.js';
const idl = JSON.parse(readFileSync(new URL('../../src/lib/solana/idl/kydos_launchpad.json', import.meta.url))), coder = new BorshCoder(idl);
const mint = Keypair.generate().publicKey, trader = Keypair.generate().publicKey, treasury = Keypair.generate().publicKey;
const chain = 'test-chain', signature = 'fixture-signature', bn = value => new BN(String(value));
function event(name, fields) { return 'Program data: ' + Buffer.concat([Buffer.from(idl.events.find(item => item.name === name).discriminator), coder.types.encode(name, fields)]).toString('base64'); }
const buy = () => event('tradeExecuted', { mint, trader, side: 0, solAmount: bn(990000000), tokenAmount: bn(123456789012345), graduated: false });
const fee = () => event('tradeFeePaid', { mint, trader, side: 0, treasury, grossSol: bn(1000000000), feeSol: bn(10000000), netSol: bn(990000000) });
const tx = logs => ({ slot: 100, blockTime: 1700000000, transaction: { signatures: [signature], message: { accountKeys: [], instructions: [] } }, meta: { err: null, logMessages: logs } });
const invoke = `Program ${PROGRAM_ADDRESS} invoke [1]`, success = `Program ${PROGRAM_ADDRESS} success`, decode = transaction => decodeKydosTransaction(transaction, { chain, transactionIndex: 2 });
test('create plus multiple buys preserves raw amounts, fees and independent event identities', () => {
  const rows = decode(tx([invoke, event('launchCreated', { mint, creator: trader, totalSupply: bn(1000000000000000) }), success, invoke, buy(), fee(), buy(), fee(), success]));
  assert.deepEqual(rows.map(row => row.side), ['launch', 'buy', 'buy']); assert.equal(rows[0].supply_raw, '1000000000000000'); assert.equal(rows[1].token_raw, '123456789012345'); assert.equal(rows[1].fee_sol_raw, '10000000'); assert.equal(rows[1].wallet, trader.toBase58());
  assert.equal(uniqueEvents([...rows, ...rows]).length, 3); assert.equal(mergeTrades([], rows.slice(1).map(chartTrade)).length, 2);
});
test('sell reserve volume is gross; wallet proceeds and fees remain separate', () => {
  const rows = decode(tx([invoke, event('tradeExecuted', { mint, trader, side: 1, solAmount: bn(1000000000), tokenAmount: bn(1000000), graduated: false }), event('tradeFeePaid', { mint, trader, side: 1, treasury, grossSol: bn(1000000000), feeSol: bn(10000000), netSol: bn(990000000) }), success]));
  assert.equal(rows[0].sol_amount, 1); assert.equal(rows[0].net_sol_raw, '990000000');
});
test('failed transactions and foreign/CPI rollback events are excluded; incomplete logs block replay', () => {
  assert.deepEqual(decode({ ...tx([]), meta: { err: 'failed' } }), []);
  const foreign = Keypair.generate().publicKey.toBase58(); assert.deepEqual(decode(tx([`Program ${foreign} invoke [1]`, buy(), fee(), `Program ${foreign} success`])), []);
  assert.deepEqual(decode(tx([invoke, buy(), fee(), `Program ${PROGRAM_ADDRESS} failed: rollback`])), []);
  for (const logs of [[invoke, buy(), success], [invoke, buy(), fee()], [invoke, 'Log truncated', success]]) assert.throws(() => decode(tx(logs)));
  assert.throws(() => decodeKydosTransaction(tx([]), { chain, transactionIndex: -1 }), /position/);
});
test('enhanced adapter accepts native SOL and WSOL legs without treating fee payer as trader', () => {
  const token = { mint: mint.toBase58(), userAccount: trader.toBase58(), rawTokenAmount: { tokenAmount: '1000000', decimals: 6 } }, wsol = { mint: SOL_MINT, rawTokenAmount: { tokenAmount: '2000000000', decimals: 9 } };
  for (const swap of [{ nativeInput: { amount: '2000000000' }, tokenOutputs: [token] }, { tokenInputs: [wsol], tokenOutputs: [token] }]) {
    const row = normalizeHeliusTrade({ signature, feePayer: treasury.toBase58(), events: { swap } }, mint.toBase58(), chain); assert.equal(row.sol_amount, 2); assert.equal(row.token_amount, 1); assert.equal(row.wallet, trader.toBase58());
  }
  assert.equal(normalizeHeliusTrade({ signature, events: {} }, mint.toBase58(), chain), null);
});
function entityFor(rows) { return { filter: async (query, sort, limit = 100) => rows.filter(row => !query.order_key || Object.entries(query.order_key).every(([operator, cursor]) => operator === '$gt' ? row.order_key > cursor : row.order_key < cursor)).sort((a, b) => (sort.startsWith('-') ? -1 : 1) * a.order_key.localeCompare(b.order_key)).slice(0, limit) }; }
test('history reaches beyond 500 rows; bursts beyond 50 drain with no missing/duplicate events', async () => {
  const rows = Array.from({ length: 850 }, (_, i) => ({ event_id: String(i), order_key: eventOrderKey(i, 0, 1) })), entity = entityFor(rows.flatMap(row => [row, { ...row }]));
  const initial = await readEventWindow(entity, {}, { limit: 200 }); let before = initial.nextBefore, history = [...initial.events];
  while (before) { const page = await readEventWindow(entity, {}, { before, limit: 200 }); history.push(...page.events); before = page.nextBefore; }
  assert.equal(uniqueEvents(history).length, 850);
  let after = rows[49].order_key, live = [];
  for (;;) { const page = await readEventWindow(entity, {}, { after, limit: 50 }); live.push(...page.events); after = page.nextAfter; if (!page.hasMore) break; }
  assert.equal(uniqueEvents(live).length, 800); assert.equal(live.at(-1).event_id, '849');
});
test('durable live checkpoint waits for catch-up and leaves older-history cursor unchanged', () => {
  let state = advanceIndexState({}, { head: 'h100', before: 'h76', complete: false }, 'live', 1);
  state = advanceIndexState(state, { head: 'h200', before: 'h176', complete: false }, 'live', 2);
  assert.equal(state.head, 'h100'); assert.equal(state.pending_head, 'h200'); assert.equal(state.last_synced_at, 1);
  state = advanceIndexState(state, { head: 'h175', before: 'h101', complete: true }, 'live', 3);
  assert.equal(state.head, 'h200'); assert.equal(state.live_before, ''); assert.equal(state.history_before, 'h76'); assert.equal(state.last_synced_at, 3);
});
test('raw replay derives block order, rejects gaps and deduplicates repeated inserts', async () => {
  const rpc = async method => method === 'getSignaturesForAddress' ? [{ signature, err: null }] : method === 'getBlock' ? { signatures: ['earlier', signature] } : tx([invoke, buy(), fee(), success]);
  const page = await readRawPage({ rpc, chain }); assert.equal(page.rows[0].transaction_index, 1);
  await assert.rejects(readRawPage({ rpc: async method => method === 'getTransaction' ? null : rpc(method), chain }), /gap/);
  let created; assert.equal(await persistEvents({ filter: async () => [], bulkCreate: async values => { created = values; } }, [...page.rows, ...page.rows]), 1); assert.equal(created.length, 1);
});
test('same-second candle open/close follow chain position; late corrections require full update', () => {
  const trades = [3, 1, 2].map(i => ({ eventId: String(i), slot: i, transactionIndex: 0, eventIndex: 0, blockTime: 120, price: i, solAmount: i }));
  const bars = bucketTrades(mergeTrades(trades, trades), 60); assert.deepEqual(bars, [{ time: 120, open: 1, high: 3, low: 1, close: 3, volume: 6 }]);
  assert.equal(bucketTrades([{ ...trades[0], price: NaN }], 60).length, 0);
  const old = [{ ...bars[0], time: 60 }, ...bars]; assert.equal(canUpdateLastCandle(old, [...old.slice(0, -1), { ...bars[0], close: 4 }]), true); assert.equal(canUpdateLastCandle(old, [{ ...old[0], close: 4 }, bars[0]]), false);
});
test('quiet markets remain synced; USD/FDV use the chart price and expire old conversion data', () => {
  const now = 1700000000000;
  assert.equal(feedHealth({ now, lastSync: now, coverage: { configured: true, indexedThrough: now }, error: '' }), 'Synced');
  assert.equal(feedHealth({ now: now + 130000, lastSync: now, coverage: { configured: true, indexedThrough: now } }), 'Updates delayed');
  const info = { supply: '1000000000', decimals: 6, solUsdPrice: 100, tokenUsdPrice: 999, solUsdObservedAt: now };
  const metrics = deriveMarketMetrics([{ price: 0.002 }], info, now); assert.equal(metrics.priceUsd, 0.2); assert.equal(metrics.fdvUsd, 200); assert.equal(metrics.fdvSol, 2);
  assert.equal(deriveMarketMetrics([{ price: 0.002 }], info, now + 120001).priceUsd, null); assert.equal(formatPrice(0.0000000123), '0.0000000123');
});
