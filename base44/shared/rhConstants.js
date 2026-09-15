// Event topics, function selectors and the curated V1 token set for the Kydos aggregator.

// keccak256 event signatures
export const TOPIC = {
  // Swap(address,uint256,uint256,uint256,uint256,address)
  UNIV2_SWAP: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
  // Sync(uint112,uint112)
  UNIV2_SYNC: "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1",
  // Swap(address,address,int256,int256,uint160,uint128,int24)
  UNIV3_SWAP: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  // Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)
  UNIV4_SWAP: "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f",
  POOL_REGISTERED: "0x01bf263a1db1652580721573296e1a1fa70b3d4c87f61d02a69c4e1109d2d573",
  HOOK_FEE_COLLECTED: "0xc532c43b3423e14ef72748f1c8291238829ca0af8ba9b67975ad1483485a4b4d",
  POOL_FEES_SWEPT: "0x2f3c43579b9064b6f28edcf41608f3815792d274a56afe024359703cb4ea9b30",
  // Transfer(address,address,uint256)
  TRANSFER: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  KYDOS_BUY: "0xbeae048c6d270d9469f86cf6e8fedda3c60ad770f16c24c9fc131c8e9a09101d",
  KYDOS_SELL: "0x846c37eef631e0943682d87352ec117c20008eb7f425c9b85ac011a6d4774cc0",
};

// 4-byte function selectors
export const SELECTOR = {
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  getReserves: "0x0902f1ac",
  fee: "0xddca3f43",
  slot0: "0x3850c7bd",
  decimals: "0x313ce567",
  symbol: "0x95d89b41",
  name: "0x06fdde03",
  totalSupply: "0x18160ddd",
  balanceOf: "0x70a08231",
  currentPrice: "0x9d1b464a",
};

export const VENUES = ["uniswap_v2", "uniswap_v3", "uniswap_v4", "rialto", "kydos_curve"];

// Symbols remain useful as display metadata, but never establish quote-asset identity.
export const STABLES = ["USDC", "USDT", "DAI", "USDG", "USDC.E", "BUSD", "FRAX", "USDS"];

// Canonical Robinhood Chain quote contracts. USD valuation is address-based so a token
// cannot spoof a trusted quote asset by returning the WETH or USDG symbol.
export const RH_QUOTE = Object.freeze({
  WETH: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
  USDG: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
});

export const isCanonicalQuote = (address) =>
  Object.values(RH_QUOTE).includes(String(address || "").toLowerCase());

export const quoteUsdValue = (address, ethUsd) => {
  const normalized = String(address || "").toLowerCase();
  if (normalized === RH_QUOTE.USDG) return 1;
  if (normalized === RH_QUOTE.WETH) return Number(ethUsd) || 0;
  return 0;
};

// V1 tracked tokens. Pools are discovered on-chain, not hardcoded.
export const TRACKED_TOKENS = [
  { address: "0xe27501d787d647cc82a5b4a7eafd5750386f1b77", symbol: "TWINE", name: "TWINE" },
  { address: "0x020bfc650a365f8bb26819deaabf3e21291018b4", symbol: "CASHCAT", name: "Cash Cat" },
  { address: "0x1cdb289befdfac8af945a288bcdccc382cb34d32", symbol: "XL", name: "X Link" },
];

export const LOG_SPAN = 10; // max block range per eth_getLogs call (Alchemy free tier)
export const MAX_BLOCK_SPAN = 500; // per eth_getLogs call (dedicated provider)
export const FALLBACK_BLOCK_SPAN = 100; // per call on the throttled public endpoint
export const MAX_CATCHUP_SPAN = 5000; // per indexer cycle

export const INTERVALS = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

export const CHAIN_ID_DEFAULT = 46630;

export const isStable = (symbol) => !!symbol && STABLES.includes(symbol.toUpperCase());