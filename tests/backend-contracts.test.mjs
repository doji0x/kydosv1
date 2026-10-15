import test from 'node:test';
import assert from 'node:assert/strict';
import { beforeDeadline } from '../base44/shared/astraDeadline.ts';
import { parseToolArgs } from '../base44/shared/astraToolArgs.ts';
import { commitFile, ASTRA_WORKING_BRANCH } from '../base44/shared/astraGithub.ts';
import { runTool } from '../base44/shared/astraTools.ts';
import { runManagerWithGithub } from '../base44/functions/astraChat/githubChat.ts';

const head = 'a'.repeat(40), other = 'b'.repeat(40), repo = 'doji0x/kydosv1';
const commitArgs = ['fixture-token', repo, ASTRA_WORKING_BRANCH, 'file.txt', 'content', 'message'];
function github(t, responses) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const request = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null };
    calls.push(request);
    const next = responses.shift(); assert.ok(next, `Unexpected request ${request.url}`);
    const [suffix, method, status, payload] = next;
    assert.ok(request.url.endsWith(suffix)); assert.equal(request.method, method);
    return new Response(JSON.stringify(payload), { status });
  });
  t.after(() => assert.equal(responses.length, 0));
  return calls;
}
const readHead = value => [
  [repo, 'GET', 200, { default_branch: 'main' }],
  ['/git/ref/heads/astra%2Flatest', 'GET', 200, { object: { sha: value } }],
  ['/git/ref/heads/astra%2Flatest', 'GET', 200, { object: { sha: value } }],
];

test('deadline preserves synchronous, promised and falsy results', async () => {
  const deadline = Date.now() + 5000;
  assert.deepEqual(await beforeDeadline(() => ({ status: 'ok', rows: [1] }), deadline, 'timeout'), { status: 'ok', rows: [1] });
  assert.equal(await beforeDeadline(async () => 0, deadline, 'timeout'), 0);
  assert.equal(await beforeDeadline(() => undefined, deadline, 'timeout'), undefined);
});
test('elapsed and invalid deadlines reject without invoking the operation', async () => {
  for (const deadline of [Date.now() - 1, NaN, Infinity]) {
    await assert.rejects(beforeDeadline(() => assert.fail('Must not execute'), deadline, 'expired'), /expired/);
  }
});
test('deadline rejects stalled operations and preserves the original rejection', async () => {
  await assert.rejects(beforeDeadline(() => new Promise(() => {}), Date.now() + 10, 'stalled'), /stalled/);
  const failure = new Error('original');
  await assert.rejects(beforeDeadline(() => { throw failure; }, Date.now() + 5000, 'late'), error => error === failure);
});
test('tool arguments admit only known typed fields and normalize nullable omissions', () => {
  const input = { repo, path: 'README.md', offset: 0, limit: 10, expectedHash: null, filePaths: ['one'] };
  const result = parseToolArgs(input);
  assert.deepEqual(result, { repo, path: 'README.md', offset: 0, limit: 10, filePaths: ['one'] });
  result.filePaths.push('two'); assert.equal(input.filePaths.length, 1);
  for (const value of [null, [], 'text', 3, { path: 1 }, { limit: '2' }, { offset: -1 }, { runId: 1.5 },
    { limit: Infinity }, { limit: Number.MAX_SAFE_INTEGER + 1 }, { filePaths: [1] },
    { expectedHeadSha: head }, JSON.parse('{"__proto__":{"bad":true}}'), { constructor: 'x' }, Object.create({ repo })]) {
    assert.throws(() => parseToolArgs(value));
  }
});
test('missing write precondition rejects before any network call', async t => {
  github(t, []);
  for (const value of [undefined, null, '', 'HEAD', 'a'.repeat(39)]) await assert.rejects(commitFile(...commitArgs, value), /expectedHeadSha/);
  await assert.rejects(runTool('fixture-token', 'commitFile', { repo, path: 'file.txt', content: 'text', message: 'm' }, {}), /expectedHeadSha/);
  await assert.rejects(runTool('fixture-token', 'commitFile', { repo, expectedHeadSha: head }, {}), /Unsupported/);
});
test('stale write precondition leaves the branch untouched', async t => {
  const calls = github(t, readHead(other));
  await assert.rejects(commitFile(...commitArgs, head), /repository changed/);
  assert.ok(calls.every(call => call.method === 'GET'));
});
test('generic tool dispatch carries the trusted head through a nonforced commit', async t => {
  const responses = [...readHead(head),
    ['/git/commits/' + head, 'GET', 200, { tree: { sha: 'base-tree' } }],
    ['/git/blobs', 'POST', 201, { sha: 'blob' }], ['/git/trees', 'POST', 201, { sha: 'tree' }],
    ['/git/commits', 'POST', 201, { sha: other }], ['/git/refs/heads/astra%2Flatest', 'PATCH', 200, {}],
    [repo, 'GET', 200, { default_branch: 'main' }]];
  const calls = github(t, responses);
  const result = await runTool('fixture-token', 'commitFile', { repo, path: 'file.txt', content: 'text', message: 'm' }, {}, { expectedHeadSha: head });
  assert.equal(result.commit, other);
  assert.deepEqual(calls.find(c => c.url.endsWith('/git/commits')).body.parents, [head]);
  assert.deepEqual(calls.find(c => c.method === 'PATCH').body, { sha: other, force: false });
});
test('malformed model arguments are reported without repository writes', async t => {
  let turns = 0; const logs = [];
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    return new Response(JSON.stringify({ output: turns++ === 0
      ? [{ type: 'function_call', call_id: 'one', name: 'readFile', arguments: '[]' }]
      : [{ type: 'message', content: [{ type: 'output_text', text: '{"reply":"stopped"}' }] }] }));
  });
  const result = await runManagerWithGithub({ apiKey: 'fixture-token', model: 'test', messages: [], responseFormat: undefined,
    githubToken: 'fixture-token', base44: {}, headSha: head, conversationId: 'test', log: async item => logs.push(item),
    reasoningEffort: 'medium', deadline: Date.now() + 5000, assertActive: async () => {} });
  assert.equal(turns, 2); assert.equal(result.hadErrors, true);
  assert.match(logs[0].summary, /plain object/);
});
