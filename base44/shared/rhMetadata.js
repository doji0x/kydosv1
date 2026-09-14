// Optional off-chain branding only; market data remains entirely self-indexed.
const checked = new Map();
const https = (value) => typeof value === "string" && value.startsWith("https://") ? value : null;

export async function loadTokenBranding(db, token) {
  if (token.icon_url) return token;
  const address = token.address.toLowerCase();
  if (Date.now() - (checked.get(address) || 0) < 3600000) return token;
  checked.set(address, Date.now());
  return await (async () => {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) { console.warn("Token branding provider status", res.status); return token; }
    const data = await res.json();
    const info = data.pairs?.find((p) => p.chainId === "robinhood" && p.baseToken?.address?.toLowerCase() === address && https(p.info?.imageUrl))?.info;
    if (!info) return token;
    const fields = { icon_url: https(info.imageUrl) };
    const links = {
      website: info.websites?.[0]?.url,
      twitter: info.socials?.find((s) => s.type === "twitter")?.url,
      telegram: info.socials?.find((s) => s.type === "telegram")?.url,
    };
    for (const [key, value] of Object.entries(links)) if (!token[key] && https(value)) fields[key] = value;
    await db.entities.RhToken.update(token.id, fields);
    return { ...token, ...fields };
  })();
}