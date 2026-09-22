import { validateLaunch } from './market.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const types = ['image/png', 'image/jpeg', 'image/webp'];
const cidPattern = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/;

export function validateMetadataDetails({ name, symbol, description = '' }) {
  validateLaunch({ name, symbol, metadataUri: 'https://metadata.invalid/token.json' });
  if (typeof description !== 'string' || new TextEncoder().encode(description).length > 2000) throw new Error('Description exceeds 2000 UTF-8 bytes');
}

export async function validateLaunchImage(file) {
  if (!file || !types.includes(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error('Choose a PNG, JPG or WebP image up to 5 MB');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  const valid = file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
    : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (!valid) throw new Error('The image content does not match its file type');
}

// Uploads precede wallet signing and are not rolled back with a Solana transaction.
// Keep the successful image CID when JSON upload fails, avoiding duplicate uploads.
export async function uploadLaunchMetadata({ file, details, invoke, fetchImpl = fetch, imageCid, onImageUploaded, onStage }) {
  validateMetadataDetails(details);
  await validateLaunchImage(file);
  const call = async body => {
    try {
      const response = await invoke('launchMetadata', body);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    } catch (error) { throw new Error(error.response?.data?.error || error.message || 'Upload failed'); }
  };
  if (!imageCid) {
    onStage?.('uploading-image');
    const signed = await call({ action: 'image-upload', type: file.type, size: file.size });
    const url = new URL(signed?.url);
    if (url.protocol !== 'https:' || url.host !== 'uploads.pinata.cloud' || url.username || url.password || !url.pathname.startsWith('/v3/files')) throw new Error('Invalid image upload destination');
    const data = new FormData();
    data.append('file', file); data.append('network', 'public');
    const response = await fetchImpl(url.href, { method: 'POST', body: data, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error('Image upload failed. Please try again.');
    imageCid = (await response.json()).data?.cid;
    if (typeof imageCid !== 'string' || !cidPattern.test(imageCid)) throw new Error('Invalid image upload response');
    onImageUploaded?.(imageCid);
  }
  if (!cidPattern.test(imageCid)) throw new Error('Invalid image CID');
  onStage?.('uploading-metadata');
  const result = await call({ action: 'metadata', name: details.name, symbol: details.symbol, description: details.description, imageCid });
  if (typeof result?.metadataUri !== 'string' || !result.metadataUri.startsWith('ipfs://') || !cidPattern.test(result.metadataUri.slice(7))) throw new Error('Invalid metadata upload response');
  validateLaunch({ ...details, metadataUri: result.metadataUri });
  return { metadataUri: result.metadataUri, imageCid };
}
