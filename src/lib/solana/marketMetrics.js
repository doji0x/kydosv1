const finite = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function deriveMarketMetrics(trades, marketInfo, now = Date.now()) {
  const priceSol = finite(trades.at(-1)?.price);
  const decimals = Number.isInteger(marketInfo?.decimals) ? marketInfo.decimals : null;
  const rawSupply = finite(marketInfo?.supply);
  const supply = rawSupply != null && decimals != null ? rawSupply / 10 ** decimals : null;
  const age = now - Number(marketInfo?.solUsdObservedAt);
  const solUsdPrice = age >= 0 && age < 120000 ? finite(marketInfo?.solUsdPrice) : null;
  const priceUsd = priceSol != null && solUsdPrice != null ? priceSol * solUsdPrice : null;
  return {
    priceSol,
    priceUsd,
    supply,
    fdvSol: priceSol != null && supply != null ? priceSol * supply : null,
    fdvUsd: priceUsd != null && supply != null ? priceUsd * supply : null,
  };
}

export function formatCompact(value, prefix = '', suffix = '') {
  if (value == null || !Number.isFinite(value)) return '—';
  const formatted = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  return `${prefix}${formatted}${suffix}`;
}

export function formatPrice(value, prefix = '', suffix = '') {
  if (value == null || !Number.isFinite(value)) return '—';
  const formatted = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6, useGrouping: value >= 1 }).format(value);
  return `${prefix}${formatted}${suffix}`;
}