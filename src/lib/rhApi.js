// Client access to the Kydos market API (our own indexer — no third-party market data).
import { base44 } from "@/api/base44Client";

const call = async (fn, payload = {}) => (await base44.functions.invoke(fn, payload)).data;

export const fetchRhTrending = (sort = "volume_24h") => call("getRhTrending", { sort });
export const fetchRhToken = (address) => call("getRhToken", { address });
export const fetchRhCandles = (address, interval = "5m", limit = 120) =>
  call("getRhCandles", { address, interval, limit });
export const fetchRhTrades = (address, limit = 50) => call("getRhTrades", { address, limit });
export const fetchRhHolders = (address, limit = 20) => call("getRhHolders", { address, limit });