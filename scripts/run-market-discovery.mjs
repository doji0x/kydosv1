#!/usr/bin/env node
// Optional single-instance worker. Disable the Base44 cron before running this.
const rawUrl = process.env.KYDOS_MARKET_REFRESH_URL;
const token = process.env.KYDOS_MARKET_REFRESH_TOKEN;
let url;
try { url = new URL(rawUrl); } catch { throw new Error('Set KYDOS_MARKET_REFRESH_URL to the deployed refreshMarketDiscovery function URL.'); }
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/refreshMarketDiscovery')) throw new Error('The refresh URL must be HTTPS, end in /refreshMarketDiscovery, and contain no credentials or query parameters.');
if (!token || token.length < 32) throw new Error('Set KYDOS_MARKET_REFRESH_TOKEN to the same random secret (at least 32 characters) configured on the backend.');
const once = process.argv.includes('--once');
let stopped = false, timer;
const controller = new AbortController();
const stop = () => { stopped = true; clearTimeout(timer); controller.abort(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
async function tick() {
  const started = Date.now(); let delay = 30_000;
  try {
    const response = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'x-kydos-market-token': token, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]) });
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) { console.error('Refresh authorization rejected. Verify the worker secret and hosted function access.'); stop(); process.exitCode = 1; return; }
    if (!response.ok) { delay = response.status === 429 ? 120_000 : 60_000; console.error(`Market refresh returned HTTP ${response.status}. The previous snapshot is retained.`); if (once) process.exitCode = 1; }
    else console.log(`Market snapshot checked at ${new Date().toISOString()}`);
  } catch {
    if (!stopped) { console.error('Market refresh request failed. The previous snapshot is retained.'); delay = 60_000; if (once) process.exitCode = 1; }
  }
  if (!once && !stopped) timer = setTimeout(tick, Math.max(1000, delay - (Date.now() - started)));
}
await tick();
