import { toNum, toBig, words, addrFromWord, scaled } from "./rhRpc.js";

const transferLeg = (log, decimals) => ({
  from: addrFromWord(log.topics[1] || ""),
  to: addrFromWord(log.topics[2] || ""),
  value: scaled(toBig(words(log.data)[0] || "0x0"), decimals ?? 18),
});

export function rialtoTrades(pool, logs) {
  const byTx = new Map();
  const at = (hash) => {
    if (!byTx.has(hash)) byTx.set(hash, { base: 0, quote: 0, log_index: Infinity, block_number: 0, trader: "" });
    return byTx.get(hash);
  };

  for (const log of logs) {
    const addr = log.address.toLowerCase();
    const isBase = addr === pool.token_address;
    const isQuote = addr === pool.quote_address;
    if (!isBase && !isQuote) continue;
    const leg = transferLeg(log, isBase ? pool.base_decimals : pool.quote_decimals);
    const inbound = leg.to === pool.address;
    const outbound = leg.from === pool.address;
    if (inbound === outbound || !leg.value) continue;
    const tx = at(log.transactionHash);
    const signed = inbound ? leg.value : -leg.value;
    if (isBase) {
      tx.base += signed;
      if (toNum(log.logIndex) < tx.log_index) {
        tx.log_index = toNum(log.logIndex);
        tx.trader = outbound ? leg.to : leg.from;
      }
      tx.block_number = toNum(log.blockNumber);
    } else tx.quote += signed;
  }

  const out = [];
  for (const [hash, tx] of byTx) {
    const token_amount = Math.abs(tx.base);
    const quote_amount = Math.abs(tx.quote);
    if (!token_amount || !quote_amount || Math.sign(tx.base) === Math.sign(tx.quote)) continue;
    out.push({ side: tx.base < 0 ? "buy" : "sell", token_amount, quote_amount,
      trader: tx.trader, tx_hash: hash, log_index: tx.log_index === Infinity ? 0 : tx.log_index,
      block_number: tx.block_number });
  }
  return out;
}