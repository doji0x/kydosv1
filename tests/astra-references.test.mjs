import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REFERENCE_BYTES, boundedText, contentHash, documentQuality, fetchPublicDocument, pageInteger, publicDocumentUrl, referencePage, referenceSummary } from '../base44/shared/astraReferences.ts';

// Pure helpers and mocked HTTP only: no external network, storage or paid calls.
test('GitHub blob files resolve to raw sources; unsupported URLs fail closed', () => {
  assert.equal(publicDocumentUrl('https://github.com/pump-fun/pump-public-docs/blob/abc123/README.md').href,
    'https://raw.githubusercontent.com/pump-fun/pump-public-docs/abc123/README.md');
  for (const url of [
    'http://solana.com/docs/a.md', 'https://127.0.0.1/a', 'https://localhost/a',
    'https://solana.com.evil.example/docs/a', 'https://user:pass@solana.com/docs/a',
    'https://solana.com:8443/docs/a', 'https://solana.com/docs/a?token=secret',
    'https://solana.com/docs/a#part', 'https://solana.com/blog/a',
    'https://github.com/pump-fun/pump-public-docs',
    'https://github.com/pump-fun/pump-public-docs/tree/main',
  ]) assert.throws(() => publicDocumentUrl(url), url);
});

test('HTML shells and empty content are not readable source', () => {
  assert.equal(documentQuality('<!DOCTYPE html><html>shell</html>'), 'html-shell');
  assert.equal(documentQuality('   '), 'empty');
  assert.equal(documentQuality('# RPC\n<CodeGroup>example</CodeGroup>'), 'readable-unreviewed');
});

test('bounded decoding rejects declared and streamed overflow, binary and invalid UTF-8', async () => {
  await assert.rejects(boundedText(new Response('ok', { headers: { 'content-length': String(MAX_REFERENCE_BYTES + 1) } })), /1 MB/);
  await assert.rejects(boundedText(new Response(new Uint8Array(MAX_REFERENCE_BYTES + 1).fill(65))), /1 MB/);
  await assert.rejects(boundedText(new Response('a'.repeat(500001))), /500,000/);
  await assert.rejects(boundedText(new Response('a\0b')), /Binary/);
  await assert.rejects(boundedText(new Response(new Uint8Array([0xff]))));
  assert.equal(await boundedText(new Response('Readable λ')), 'Readable λ');
});

test('pages reconstruct a document and explicitly report partial reads', () => {
  const content = 'abcdefg';
  const first = referencePage(content, 0, 3);
  const second = referencePage(content, first.next_offset, 3);
  const last = referencePage(content, second.next_offset, 3);
  assert.equal(first.content + second.content + last.content, content);
  assert.equal(last.next_offset, null);
  assert.equal(last.truncated, true);
  assert.equal(referencePage(content, 0, 10).truncated, false);
  assert.throws(() => referencePage(content, 8, 3));
  assert.throws(() => referencePage(content, 0, 0));
  assert.equal(pageInteger(undefined, 5, 10), 5);
  for (const value of [-1, 1.5, '2', null, 11]) assert.throws(() => pageInteger(value, 5, 10));
});

test('fetch uses bounded unauthenticated raw-text requests and records provenance', async () => {
  const source = '# Example\nSource data is not authorization.';
  let calls = 0;
  const result = await fetchPublicDocument('https://github.com/owner/repo/blob/abc123/spec.md', async (url, options) => {
    calls++;
    assert.equal(url, 'https://raw.githubusercontent.com/owner/repo/abc123/spec.md');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal);
    assert.equal(options.headers.authorization, undefined);
    return new Response(source, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  });
  assert.equal(calls, 1);
  assert.equal(result.content, source);
  assert.equal(result.content_sha256, await contentHash(source));
  assert.equal(result.publisher, 'owner/repo');
  assert.equal(result.source_version, 'abc123');
  assert.equal(result.license, 'unverified');
  assert.equal(result.quality, 'readable-unreviewed');
  assert.ok(Number.isFinite(Date.parse(result.retrieved_at)));
});

test('fetch rejects unsupported content, HTTP failure and redirect errors', async () => {
  const url = 'https://www.helius.dev/docs/example.md';
  for (const response of [
    new Response('missing', { status: 404 }),
    new Response('<html>page</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('<html>page</html>', { headers: { 'content-type': 'text/plain' } }),
    new Response('', { headers: { 'content-type': 'text/plain' } }),
  ]) await assert.rejects(fetchPublicDocument(url, async () => response));
  await assert.rejects(fetchPublicDocument(url, async () => { throw new TypeError('redirect blocked'); }), /redirect blocked/);
  await assert.rejects(fetchPublicDocument('https://private.example/doc', async () => assert.fail('must not fetch')));
});

test('summaries omit private storage URLs and do not invent legacy provenance', () => {
  const summary = referenceSummary({ id: 'legacy', title: 'x'.repeat(200), summary: 'y'.repeat(600), file_uri: 'private', signed_url: 'private' });
  assert.equal(summary.title.length, 160);
  assert.equal(summary.summary.length, 500);
  assert.equal(summary.quality, 'legacy-unreviewed');
  assert.equal(summary.license, 'unverified');
  assert.equal(summary.source_version, undefined);
  assert.equal('file_uri' in summary, false);
  assert.equal('signed_url' in summary, false);
});
