export async function readMarketRequest(request) {
  if (Number(request.headers.get('content-length')) > 1024) throw Object.assign(new Error('Market request is too large.'), { status: 400 });
  const reader = request.body?.getReader(); if (!reader) return {};
  const decoder = new TextDecoder(); let bytes = 0, body = '';
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength;
      if (bytes > 1024) { await reader.cancel(); throw Object.assign(new Error('Market request is too large.'), { status: 400 }); }
      body += decoder.decode(value, { stream: true });
    }
    try { const value = JSON.parse(body + decoder.decode() || '{}'); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; }
    catch { throw Object.assign(new Error('Invalid market request.'), { status: 400 }); }
  } finally { reader.releaseLock(); }
}