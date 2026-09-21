const finite = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function deriveMarketMetrics(trades, marketInfo) {
  const priceSol = finite(trades.at(-1)?.price);
  const decimals = Number.isInteger(marketInfo?.decimals) ? marketInfo.decimals : null;
  const rawSupply = finite(marketInfo?.supply);
  const supply = rawSupply != null && decimals != null ? rawSupply / 10 ** decimals : null;
  const solUsdPrice = finite(marketInfo?.solUsdPrice);
  const directUsd = finite(marketInfo?.tokenUsdPrice);
  const priceUsd = directUsd ?? (priceSol != null && solUsdPrice != null ? priceSol * solUsdPrice : null);
  return {
    priceSol,
    priceUsd,
    supply,
    marketCapSol: priceSol != null && supply != null ? priceSol * supply : null,
    marketCapUsd: priceUsd != null && supply != null ? priceUsd * supply : null,
  };
}

export function formatCompact(value, prefix = '', suffix = '') {
  if (value == null || !Number.isFinite(value)) return '—';
  const formatted = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  return `${prefix}${formatted}${suffix}`;
}

export function formatPrice(value, prefix = '', suffix = '') {
  if (value == null || !Number.isFinite(value)) return '—';
  const formatted = value > 0 && value < 0.01 ? value.toPrecision(4) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value);
  return `${prefix}${formatted}${suffix}`;
}