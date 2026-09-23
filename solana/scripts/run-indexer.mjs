// Exactly one worker instance per deployment. No Solana signing key is used.
const endpoint = process.env.KYDOS_INDEXER_URL, token = process.env.KYDOS_INDEXER_TOKEN;
if (!endpoint || !token || token.length < 32) throw new Error('KYDOS_INDEXER_URL and a >=32-character KYDOS_INDEXER_TOKEN are required');
const url = new URL(endpoint);
if (url.protocol !== 'https:' || url.username || url.password || url.search) throw new Error('Use an HTTPS function URL without embedded credentials');
const once = process.argv.includes('--once');
let stopped = false;
process.on('SIGINT', () => { stopped = true; }); process.on('SIGTERM', () => { stopped = true; });
const invoke = async mode => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kydos-indexer-token': token }, body: JSON.stringify({ mode, limit: 25 }), signal: AbortSignal.timeout(60000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Indexer HTTP ${response.status}: ${payload.error || 'request failed'}`);
  console.log(JSON.stringify({ mode, scanned: payload.scanned, indexed: payload.indexed, network: payload.network?.name, catchingUp: !!payload.state?.live_before, historyComplete: !!payload.state?.history_complete }));
  return payload;
};
do {
  try {
    let result;
    do { result = await invoke('live'); } while (!stopped && result.state?.live_before);
    if (!stopped && !result.state?.history_complete) await invoke('history');
  } catch (error) {
    console.error(String(error.message).replace(/https?:\/\/\S+/g, '[endpoint]'));
    // Stop after ambiguous timeout rather than overlapping another writer.
    process.exitCode = 1; break;
  }
  if (!once && !stopped) await new Promise(resolve => setTimeout(resolve, 15000));
} while (!once && !stopped);
