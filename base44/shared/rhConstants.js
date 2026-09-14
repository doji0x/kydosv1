// Event topics, function selectors and the curated V1 token set for the Kydos aggregator.

// keccak256 event signatures
export const TOPIC = {
  // Swap(address,uint256,uint256,uint256,uint256,address)
  UNIV2_SWAP: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
  // Sync(uint112,uint112)
  UNIV2_SYNC: "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1",
  // Swap(address,address,int256,int256,uint160,uint128,int24)
  UNIV3_SWAP: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  // Transfer(address,address,uint256)
  TRANSFER: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
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
};

export const VENUES = ["uniswap_v2", "uniswap_v3", "rialto"];

// Symbols treated as 1:1 with USD when they are the pool's quote asset.
export const STABLES = ["USDC", "USDT", "DAI", "USDG", "USDC.E", "BUSD", "FRAX", "USDS"];

// V1 tracked tokens. Pools are discovered on-chain, not hardcoded.
export const TRACKED_TOKENS = [
  { address: "0xe27501d787d647cc82a5b4a7eafd5750386f1b77", symbol: "TWINE", name: "TWINE" },
  { address: "0x020bfc650a365f8bb26819deaabf3e21291018b4", symbol: "CASHCAT", name: "Cash Cat" },
  { address: "0x1cdb289befdfac8af945a288bcdccc382cb34d32", symbol: "XL", name: "X Link" },
];

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

export const isStable = (symbol) => !!symbol && STABLES.includes(symbol.toUpperCase());