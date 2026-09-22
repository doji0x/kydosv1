import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLaunchMetadataHandler, MAX_IMAGE_BYTES } from '../../base44/shared/launchMetadata.js';
import { uploadLaunchMetadata, validateLaunchImage } from '../../src/lib/solana/launchMetadata.js';

const cid = 'bafybeihgxdzljxb26q6nf3r3eifqeedsvt2eubqtskghpme66cgjyw4fra';
const details = { name: 'Kydos', symbol: 'KYDO', description: 'A test description' };
const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], 'coin.png', { type: 'image/png' });
const request = value => new Request('https://kydos.test/upload', { method: 'POST', body: JSON.stringify(value) });
const signing = { action: 'image-upload', size: file.size, type: file.type };
const metadata = { action: 'metadata', ...details, imageCid: cid };
const server = overrides => makeLaunchMetadataHandler({ authenticate: async () => ({ id: 'user-1' }), getSecret: async () => 'private-test-credential', ...overrides });

test('upload authorization and input limits fail before storage calls', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('Unexpected request'); };
  const anonymous = server({ authenticate: async () => null, fetchImpl });
  assert.equal((await anonymous(request(signing))).status, 401);
  const unconfigured = server({ getSecret: async () => undefined, fetchImpl });
  assert.equal((await unconfigured(request(signing))).status, 503);
  const handle = server({ fetchImpl });
  for (const bad of [null, {}, { ...signing, size: 0 }, { ...signing, size: MAX_IMAGE_BYTES + 1 }, { ...signing, type: 'image/svg+xml' },
    { ...metadata, imageCid: 'https://evil.test/file' }, { ...metadata, name: '🚀'.repeat(9) }, { ...metadata, description: 'a'.repeat(2001) }]) {
    assert.equal((await handle(request(bad))).status, 400);
  }
  assert.equal((await handle(request({ x: 'a'.repeat(17000) }))).status, 413);
  assert.equal(calls, 0);
});

test('image URL is restricted by MIME, byte count and expiry; metadata fields constructed on server', async () => {
  const requests = [];
  const handle = server({ fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return Response.json({ data: url.endsWith('/sign') ? 'https://uploads.pinata.cloud/v3/files?signature=temporary' : { cid } });
  } });
  const signed = await handle(request({ ...signing, jwt: 'attacker', expires: 99999, allow_mime_types: ['*/*'] }));
  assert.equal(signed.status, 200);
  const signedData = await signed.json();
  assert.deepEqual(Object.keys(signedData), ['url']);
  assert.ok(!JSON.stringify(signedData).includes('private-test-credential'));
  const restrictions = JSON.parse(requests[0].options.body);
  assert.equal(restrictions.expires, 60);
  assert.equal(restrictions.max_file_size, file.size);
  assert.deepEqual(restrictions.allow_mime_types, ['image/png']);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer private-test-credential');
  const result = await handle(request({ ...metadata, image: 'https://evil.test', arbitrary: 'not accepted' }));
  assert.deepEqual(await result.json(), { metadataUri: `ipfs://${cid}` });
  const body = requests[1].options.body;
  assert.equal(body.get('network'), 'public');
  assert.deepEqual(JSON.parse(await body.get('file').text()), { ...details, image: `ipfs://${cid}` });
});

test('provider errors and hostile upload destinations never expose secrets', async () => {
  for (const fetchImpl of [
    async () => new Response('private-test-credential', { status: 403 }),
    async () => { throw new Error('private-test-credential'); },
    async () => Response.json({ data: 'https://evil.test/collect' }),
  ]) {
    const result = await server({ fetchImpl })(request(signing));
    assert.equal(result.status, 502);
    assert.ok(!(await result.text()).includes('private-test-credential'));
  }
});

test('client validates image headers and preserves successful image upload across JSON failure', async () => {
  await assert.rejects(validateLaunchImage(new File(['not png'], 'fake.png', { type: 'image/png' })), /content/);
  await assert.rejects(validateLaunchImage(new File(['svg'], 'fake.svg', { type: 'image/svg+xml' })), /PNG/);
  let uploads = 0, savedCid, metadataAttempts = 0;
  const invoke = async (_name, body) => {
    if (body.action === 'image-upload') return { data: { url: 'https://uploads.pinata.cloud/v3/files?signature=temporary' } };
    metadataAttempts++;
    if (metadataAttempts === 1) throw { response: { data: { error: 'Storage temporarily unavailable' } } };
    assert.equal(body.imageCid, cid);
    return { data: { metadataUri: `ipfs://${cid}` } };
  };
  const fetchImpl = async (_url, options) => {
    uploads++;
    assert.equal(options.headers, undefined, 'browser never receives a bearer credential');
    assert.equal(options.body.get('network'), 'public');
    return Response.json({ data: { cid } });
  };
  const options = { file, details, invoke, fetchImpl, onImageUploaded: value => { savedCid = value; } };
  await assert.rejects(uploadLaunchMetadata(options), /temporarily/);
  const result = await uploadLaunchMetadata({ ...options, imageCid: savedCid });
  assert.equal(uploads, 1); assert.equal(metadataAttempts, 2);
  assert.equal(result.metadataUri, `ipfs://${cid}`);
});

test('client blocks invalid upload destinations and malformed returned metadata', async () => {
  await assert.rejects(uploadLaunchMetadata({ file, details,
    invoke: async () => ({ data: { url: 'https://uploads.pinata.cloud.evil.test/v3/files' } }),
    fetchImpl: async () => { assert.fail('must not upload'); },
  }), /destination/);
  await assert.rejects(uploadLaunchMetadata({ file, details, imageCid: cid,
    invoke: async () => ({ data: { metadataUri: 'https://evil.test' } }),
  }), /metadata upload/);
});
