import { Buffer } from 'node:buffer';
import { DECODER_VERSION, PROGRAM_ADDRESS, TOKEN_DECIMALS } from './solanaProtocol.js';
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function address(bytes) {
  let value = BigInt('0x' + bytes.toString('hex')), encoded = '';
  while (value) { encoded = alphabet[Number(value % 58n)] + encoded; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; encoded = '1' + encoded; }
  return encoded;
}
const discriminators = { '3b26bee621225914': ['launch', 80], '296e40813c4fb350': ['trade', 90], 'de1e2994fb94e4de': ['fee', 129], '33f142328cf59cc0': ['graduate', 56] };
const u64 = (data, offset) => data.readBigUInt64LE(offset).toString();
function launchDetails(transaction, mint, program) {
  const message = transaction.transaction.message;
  const keys = [...message.accountKeys, ...(transaction.meta.loadedAddresses?.writable || []), ...(transaction.meta.loadedAddresses?.readonly || [])];
  const instructions = [...message.instructions, ...(transaction.meta.innerInstructions || []).flatMap(group => group.instructions)];
  for (const instruction of instructions) {
    if (keys[instruction.programIdIndex] !== program || keys[instruction.accounts?.[1]] !== mint || !instruction.data) continue;
    let value = 0n;
    for (const character of instruction.data) { const digit = alphabet.indexOf(character); if (digit < 0) throw new Error('Invalid instruction encoding'); value = value * 58n + BigInt(digit); }
    let hex = value.toString(16); if (hex.length % 2) hex = '0' + hex;
    const data = Buffer.from(hex, 'hex');
    if (data.subarray(0, 8).toString('hex') !== 'afaf6d1f0d989bed') continue;
    let offset = 8;
    const string = max => { const size = data.readUInt32LE(offset); offset += 4; if (size > max || offset + size > data.length) throw new Error('Invalid launch details'); const text = data.subarray(offset, offset + size).toString('utf8'); offset += size; return text; };
    return { name: string(32), symbol: string(10), metadata_uri: string(200) };
  }
  return {};
}
export const eventOrderKey = (slot, transactionIndex, eventIndex) => [slot, transactionIndex, eventIndex].map(value => String(value).padStart(16, '0')).join(':');

// Scoped invocation logs exclude foreign events and rolled-back inner calls.
export function decodeKydosTransaction(transaction, { chain, transactionIndex, program = PROGRAM_ADDRESS }) {
  if (!transaction || transaction.meta?.err === undefined) throw new Error('Transaction outcome unavailable');
  if (transaction.meta.err !== null) return [];
  const signature = transaction.transaction?.signatures?.[0];
  if (!signature || !Number.isSafeInteger(transaction.slot) || !Number.isSafeInteger(transactionIndex) || transactionIndex < 0 || !Number.isFinite(transaction.blockTime)) throw new Error('Transaction position or timestamp unavailable');
  const logs = transaction.meta.logMessages;
  if (!Array.isArray(logs)) throw new Error('Event logs unavailable; replay required');
  const stack = [], decoded = [];
  for (let index = 0; index < logs.length; index++) {
    const log = logs[index];
    if (/log truncated/i.test(log)) throw new Error('Truncated event logs; replay required');
    const invoke = /^Program (\w+) invoke \[(\d+)\]$/.exec(log);
    if (invoke) {
      if (Number(invoke[2]) !== stack.length + 1) throw new Error('Incomplete invocation logs');
      stack.push({ program: invoke[1], start: decoded.length, pending: null }); continue;
    }
    const end = /^Program (\w+) (success|failed:.*)$/.exec(log);
    if (end) {
      const frame = stack.pop();
      if (!frame || frame.program !== end[1]) throw new Error('Incomplete invocation logs');
      if (end[2] !== 'success') decoded.splice(frame.start);
      else if (frame.pending) throw new Error('Trade fee event missing; replay required');
      continue;
    }
    const frame = stack.at(-1);
    if (frame?.program !== program || !log.startsWith('Program data: ')) continue;
    const data = Buffer.from(log.slice(14), 'base64'), definition = discriminators[data.subarray(0, 8).toString('hex')];
    if (!definition) throw new Error('Unknown Kydos event; decoder upgrade required');
    const [kind, length] = definition;
    if (data.length !== length) throw new Error('Invalid Kydos event length');
    const mint = address(data.subarray(8, 40));
    if (kind === 'fee') {
      const trade = frame.pending;
      if (!trade || trade.mint !== mint || trade.wallet !== address(data.subarray(40, 72)) || trade.side !== (data[72] === 0 ? 'buy' : 'sell') || data[72] > 1) throw new Error('Unmatched trade fee event');
      trade.gross_sol_raw = u64(data, 105); trade.fee_sol_raw = u64(data, 113); trade.net_sol_raw = u64(data, 121);
      if (BigInt(trade.gross_sol_raw) !== BigInt(trade.fee_sol_raw) + BigInt(trade.net_sol_raw) || trade.sol_raw !== (trade.side === 'buy' ? trade.net_sol_raw : trade.gross_sol_raw)) throw new Error('Inconsistent trade fee amounts');
      frame.pending = null; continue;
    }
    const event = { event_id: `${chain}:${program}:${signature}:${index}`, chain, program, signature, mint,
      event_index: index, transaction_index: transactionIndex, slot: transaction.slot, block_time: transaction.blockTime,
      order_key: eventOrderKey(transaction.slot, transactionIndex, index), status: 'confirmed', commitment: 'finalized',
      source: 'kydos-events', decoder_version: DECODER_VERSION, decimals: TOKEN_DECIMALS, side: kind };
    if (kind === 'trade') {
      if (frame.pending || data[72] > 1 || data[89] > 1) throw new Error('Invalid trade event');
      event.wallet = address(data.subarray(40, 72)); event.side = data[72] === 0 ? 'buy' : 'sell';
      event.sol_raw = u64(data, 73); event.token_raw = u64(data, 81); event.graduated = data[89] === 1;
      if (event.sol_raw === '0' || event.token_raw === '0') throw new Error('Zero-sized trade');
      event.sol_amount = Number(event.sol_raw) / 1e9; event.token_amount = Number(event.token_raw) / 10 ** TOKEN_DECIMALS;
      frame.pending = event;
    } else if (kind === 'launch') {
      event.wallet = address(data.subarray(40, 72)); event.supply_raw = u64(data, 72);
      Object.assign(event, launchDetails(transaction, mint, program));
    } else { event.sol_raw = u64(data, 40); event.token_raw = u64(data, 48); }
    decoded.push(event);
  }
  if (stack.length) throw new Error('Incomplete invocation logs; replay required');
  return decoded;
}
export function uniqueEvents(rows) { return [...new Map(rows.filter(row => row.event_id).map(row => [row.event_id, row])).values()]; }
export function chartTrade(row) {
  return { eventId: row.event_id, signature: row.signature, blockTime: row.block_time, slot: row.slot,
    transactionIndex: row.transaction_index, eventIndex: row.event_index, orderKey: row.order_key, wallet: row.wallet,
    price: row.sol_amount / row.token_amount, side: row.side, solAmount: row.sol_amount, tokenAmount: row.token_amount,
    solRaw: row.sol_raw, tokenRaw: row.token_raw, feeSolRaw: row.fee_sol_raw };
}
