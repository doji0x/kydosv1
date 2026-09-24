export class MarketProviderError extends Error {
  constructor(code, message, status = 503) { super(message); this.name = 'MarketProviderError'; this.code = code; this.status = status; }
}
export async function jupiterRequest(path, { apiKey, fetchImpl = fetch }) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new MarketProviderError('missing_key', 'Jupiter credentials are not configured.');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(`https://api.jup.ag/${path}`, { headers: { 'x-api-key': apiKey }, signal: controller.signal, redirect: 'manual' });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) throw new MarketProviderError('rate_limited', 'Jupiter is busy. Please retry shortly.', 429);
      if ([401, 403].includes(response.status)) throw new MarketProviderError('provider_auth', 'Jupiter rejected the configured API credentials.');
      throw new MarketProviderError('provider_unavailable', 'Jupiter is temporarily unavailable.');
    }
    const reader = response.body?.getReader();
    if (!reader || Number(response.headers.get('content-length')) > 1500000) throw new MarketProviderError('provider_shape', 'Jupiter response exceeded the size limit.');
    const decoder = new TextDecoder(); let bytes = 0, body = '';
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > 1500000) { await reader.cancel(); throw new MarketProviderError('provider_shape', 'Jupiter response exceeded the size limit.'); }
        body += decoder.decode(value, { stream: true });
      }
      try { return JSON.parse(body + decoder.decode()); }
      catch { throw new MarketProviderError('provider_shape', 'Jupiter returned invalid data.'); }
    } finally { reader.releaseLock(); }
  } catch (error) {
    if (error instanceof MarketProviderError) throw error;
    throw new MarketProviderError('provider_unavailable', 'Jupiter could not be reached.');
  } finally { clearTimeout(timer); }
}