// Pinata credentials and provider calls stay on the server. No wallet/signing API.
const UPLOADS = 'https://uploads.pinata.cloud/v3/files';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const cidPattern = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const textField = (value, label, max, optional = false) => {
  if (typeof value !== 'string' || (!optional && !value.trim()) || new TextEncoder().encode(value).length > max) {
    throw fail(`${label} must be ${optional ? 'at most' : 'between 1 and'} ${max} UTF-8 bytes`);
  }
  return value;
};

async function limitedJson(req) {
  if (!req.body) throw fail('Request body required');
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 16_384) { await reader.cancel(); throw fail('Request too large', 413); }
    text += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()); } catch { throw fail('Invalid JSON'); }
}

export function makeLaunchMetadataHandler({ authenticate, getSecret, fetchImpl = fetch, now = Date.now }) {
  return async req => {
    const respond = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    if (req.method !== 'POST') return respond({ error: 'Use POST.' }, 405);
    try {
      let user;
      try { user = await authenticate(req); } catch { throw fail('Sign in to upload token metadata', 401); }
      if (!user?.id) throw fail('Sign in to upload token metadata', 401);
      const input = await limitedJson(req);
      if (!input || !['image-upload', 'metadata'].includes(input.action)) throw fail('Unknown upload action');
      let body;
      if (input.action === 'image-upload') {
        if (!IMAGE_TYPES.has(input.type) || !Number.isSafeInteger(input.size) || input.size <= 0 || input.size > MAX_IMAGE_BYTES) {
          throw fail('Choose a PNG, JPG or WebP image up to 5 MB');
        }
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[input.type];
        body = JSON.stringify({ date: Math.floor(now() / 1000), expires: 60,
          max_file_size: input.size, allow_mime_types: [input.type],
          filename: `token-image.${extension}`, cid_version: 'v1', keyvalues: { uploader: user.id } });
      } else {
        if (typeof input.imageCid !== 'string' || !cidPattern.test(input.imageCid)) throw fail('Invalid image CID');
        const metadata = {
          name: textField(input.name, 'Name', 32), symbol: textField(input.symbol, 'Ticker', 10),
          description: textField(input.description ?? '', 'Description', 2000, true), image: `ipfs://${input.imageCid}`,
        };
        body = new FormData();
        body.append('file', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
        body.append('network', 'public');
        body.append('cid_version', 'v1');
        body.append('keyvalues', JSON.stringify({ uploader: user.id }));
      }
      const jwt = await getSecret('PINATA_JWT');
      if (!jwt) throw fail('Image uploads are not configured. Set PINATA_JWT on the server or use an existing metadata URI.', 503);
      const response = await fetchImpl(input.action === 'image-upload' ? `${UPLOADS}/sign` : UPLOADS, {
        method: 'POST', headers: { Authorization: `Bearer ${jwt}`, ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) },
        body, redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
      // Never echo provider response bodies, authorization headers or signed URLs in errors.
      if (!response.ok) throw fail('Metadata storage is unavailable. Your token has not been submitted.', 502);
      const result = await response.json();
      if (input.action === 'image-upload') {
        let url;
        try { url = new URL(result.data); } catch { throw fail('Invalid upload response', 502); }
        if (url.protocol !== 'https:' || url.host !== 'uploads.pinata.cloud' || url.username || url.password || !url.pathname.startsWith('/v3/files')) {
          throw fail('Invalid upload response', 502);
        }
        return respond({ url: url.href });
      }
      const cid = result.data?.cid;
      if (typeof cid !== 'string' || !cidPattern.test(cid)) throw fail('Invalid metadata response', 502);
      return respond({ metadataUri: `ipfs://${cid}` });
    } catch (error) {
      return respond({ error: error.status ? error.message : 'Metadata storage request failed. Please try again.' }, error.status || 502);
    }
  };
}
