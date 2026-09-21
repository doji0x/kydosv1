import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ASTRA_WORKING_BRANCH, createBranch, commitFile, resetWorkingBranch } from '../base44/shared/astraGithub.ts';
import { repositoryToolSchemas, runTool } from '../base44/shared/astraTools.ts';
import { ASTRA_DELIVERY_POLICY } from '../base44/shared/astraDelivery.ts';

const repo = 'doji0x/kydosv1';
const head = '/git/ref/heads/astra%2Flatest';
function mockGithub(t, responses) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const request = { url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null };
    calls.push(request);
    assert.ok(responses.length, `Unexpected request: ${url}`);
    const [suffix, status, body, method = 'GET'] = responses.shift();
    assert.ok(url.endsWith(suffix), url);
    assert.equal(request.method, method);
    return new Response(JSON.stringify(body), { status });
  });
  t.after(() => assert.equal(responses.length, 0, 'All expected requests consumed'));
  return calls;
}

test('existing shared branch is reused read-only with its observed SHA', async t => {
  const calls = mockGithub(t, [
    [repo, 200, { default_branch: 'main' }],
    [head, 200, { object: { sha: 'existing-head' } }],
  ]);
  assert.deepEqual(await createBranch('test', repo), {
    branch: ASTRA_WORKING_BRANCH, created: false, base: 'main', commit: 'existing-head',
  });
  assert.ok(calls.every(call => call.method === 'GET'));
});

test('authorization failure never attempts branch creation', async t => {
  mockGithub(t, [[repo, 200, { default_branch: 'main' }], [head, 403, { message: 'Forbidden' }]]);
  await assert.rejects(createBranch('test', repo), /GitHub 403/);
});

test('only a missing branch is created from the default tip', async t => {
  const calls = mockGithub(t, [
    [repo, 200, { default_branch: 'main' }], [head, 404, {}],
    ['/git/ref/heads/main', 200, { object: { sha: 'base-head' } }],
    ['/git/refs', 201, {}, 'POST'],
  ]);
  assert.equal((await createBranch('test', repo)).commit, 'base-head');
  assert.deepEqual(calls.at(-1).body, { ref: 'refs/heads/astra/latest', sha: 'base-head' });
});

test('concurrent creation reuses the winner without resetting it', async t => {
  mockGithub(t, [
    [repo, 200, { default_branch: 'main' }], [head, 404, {}],
    ['/git/ref/heads/main', 200, { object: { sha: 'base-head' } }],
    ['/git/refs', 422, {}, 'POST'], [head, 200, { object: { sha: 'winner' } }],
  ]);
  const result = await createBranch('test', repo);
  assert.equal(result.created, false);
  assert.equal(result.commit, 'winner');
});

test('reset and per-task branches fail without network writes', async t => {
  mockGithub(t, []);
  assert.ok(!repositoryToolSchemas.some(tool => tool.function.name === 'resetWorkingBranch'));
  await assert.rejects(resetWorkingBranch(), /Reset disabled/);
  await assert.rejects(runTool('test', 'resetWorkingBranch', { repo }), /Unknown tool/);
  await assert.rejects(createBranch('test', repo, 'astra/task'), /only works/);
  await assert.rejects(commitFile('test', repo, 'main', 'file', 'text', 'message'), /Commits require/);
});

test('commit preserves parent tree and surfaces ref conflicts without force or retry', async t => {
  const calls = mockGithub(t, [
    [repo, 200, { default_branch: 'main' }], [head, 200, { object: { sha: 'parent' } }],
    [head, 200, { object: { sha: 'parent' } }],
    ['/git/commits/parent', 200, { tree: { sha: 'parent-tree' } }],
    ['/git/blobs', 201, { sha: 'blob' }, 'POST'],
    ['/git/trees', 201, { sha: 'tree' }, 'POST'],
    ['/git/commits', 201, { sha: 'candidate' }, 'POST'],
    ['/git/refs/heads/astra%2Flatest', 422, { message: 'Not fast forward' }, 'PATCH'],
  ]);
  await assert.rejects(commitFile('test', repo, ASTRA_WORKING_BRANCH, 'file.txt', 'text', 'message'), /GitHub 422/);
  assert.equal(calls.find(call => call.url.endsWith('/git/trees')).body.base_tree, 'parent-tree');
  assert.deepEqual(calls.find(call => call.url.endsWith('/git/commits')).body.parents, ['parent']);
  assert.deepEqual(calls.at(-1).body, { sha: 'candidate', force: false });
});

test('direct chat builder consumes the delivery policy', async () => {
  const source = await readFile(new URL('../base44/functions/astraChat/entry.ts', import.meta.url), 'utf8');
  assert.match(source, /import \{ ASTRA_DELIVERY_POLICY \} from/);
  assert.ok(source.includes('${ASTRA_DELIVERY_POLICY}'));
  for (const requirement of ['astra/latest', 'changed files', 'delivery SHA', 'Never force', 'blocked delivery']) {
    assert.ok(ASTRA_DELIVERY_POLICY.includes(requirement), requirement);
  }
  assert.doesNotMatch(source, /AstraJob|specialist jobs|Builder delegation/);
});