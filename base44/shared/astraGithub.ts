const apiBase = 'https://api.github.com';
export const ASTRA_WORKING_BRANCH = 'astra/latest';
function headers(token) { return { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'kydos-astra', 'x-github-api-version': '2022-11-28' }; }
async function github(token, path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers: { ...headers(token), ...(options.body ? { 'content-type': 'application/json' } : {}) } });
  const text = await response.text(); const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw Object.assign(new Error(`GitHub ${response.status}: ${body.message || text.slice(0, 200)}`), { status: response.status });
  return body;
}
export function parseRepo(value) {
  const match = String(value || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match) throw new Error('Use owner/repo form.'); return { owner: match[1], repo: match[2] };
}
async function defaultBranch(token, repoRef) { const { owner, repo } = parseRepo(repoRef); return (await github(token, `/repos/${owner}/${repo}`)).default_branch; }
export async function inspectRepoState(token, repoRef, branch = ASTRA_WORKING_BRANCH) {
  const { owner, repo } = parseRepo(repoRef); const base = await defaultBranch(token, repoRef);
  await createBranch(token, repoRef, branch);
  const [baseRef, headRef, comparison] = await Promise.all([
    github(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`),
    github(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`),
    github(token, `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}`).catch(() => ({ files: [] }))
  ]);
  return { branch, baseCommitSha: baseRef.object.sha, headSha: headRef.object.sha, changedFiles: (comparison.files || []).slice(0, 100).map(file => file.filename) };
}
export async function listRepoTree(token, repoRef, branch) {
  const { owner, repo } = parseRepo(repoRef); const ref = branch || await defaultBranch(token, repoRef);
  const tree = await github(token, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  return { branch: ref, truncated: !!tree.truncated, files: (tree.tree || []).filter(x => x.type === 'blob').slice(0, 600).map(x => ({ path: x.path, size: x.size })) };
}
export async function readFile(token, repoRef, path, branch) {
  const { owner, repo } = parseRepo(repoRef); const ref = branch || await defaultBranch(token, repoRef);
  const file = await github(token, `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
  if (Array.isArray(file) || !file.content) throw new Error(`${path} is not a file.`);
  const raw = atob(file.content.replace(/\n/g, '')); const content = new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0)));
  return { path, sha: file.sha, truncated: content.length > 60000, content: content.slice(0, 60000) };
}
export async function createBranch(token, repoRef, branch = ASTRA_WORKING_BRANCH) {
  const { owner, repo } = parseRepo(repoRef); if (branch !== ASTRA_WORKING_BRANCH) throw new Error(`Astra only works on ${ASTRA_WORKING_BRANCH}.`);
  const base = await defaultBranch(token, repoRef);
  const refPath = `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const existing = await github(token, refPath).catch(error => { if (error.status === 404) return null; throw error; });
  if (existing) return { branch, created: false, base, commit: existing.object.sha };
  const ref = await github(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
  try {
    await github(token, `/repos/${owner}/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }) });
  } catch (error) {
    if (error.status !== 422) throw error;
    const concurrent = await github(token, refPath);
    return { branch, created: false, base, commit: concurrent.object.sha };
  }
  return { branch, created: true, base, commit: ref.object.sha };
}
export async function getBranchChecks(token, repoRef, branch = ASTRA_WORKING_BRANCH) {
  const { owner, repo } = parseRepo(repoRef); const ref = await github(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`); const headSha = ref.object.sha;
  const data = await github(token, `/repos/${owner}/${repo}/commits/${headSha}/check-runs?per_page=100`);
  return { branch, headSha, checks: (data.check_runs || []).map(x => ({ name: x.name, status: x.status, conclusion: x.conclusion || '' })) };
}
export async function mergeTaskBranch(token, repoRef, sourceBranch) {
  const { owner, repo } = parseRepo(repoRef); const source = String(sourceBranch || '').trim();
  if (!source || source === ASTRA_WORKING_BRANCH || source === 'main' || source === 'master') throw new Error('Provide a separate task branch to integrate.');
  const status = await getBranchChecks(token, repoRef, source); const passed = status.checks.length > 0 && status.checks.every(x => x.status === 'completed' && ['success', 'neutral', 'skipped'].includes(x.conclusion));
  if (!passed) throw new Error('Task branch integration is blocked until its required checks pass.');
  const result = await github(token, `/repos/${owner}/${repo}/merges`, { method: 'POST', body: JSON.stringify({ base: ASTRA_WORKING_BRANCH, head: source, commit_message: `Integrate ${source} into ${ASTRA_WORKING_BRANCH}` }) });
  return { merged: !!result.merged, commit: result.sha || '', message: result.message || '', sourceBranch: source, targetBranch: ASTRA_WORKING_BRANCH, checks: status.checks };
}
export async function resetWorkingBranch() {
  throw new Error(`Reset disabled: preserve shared delivery branch ${ASTRA_WORKING_BRANCH}.`);
}
export async function commitFile(token, repoRef, branch, path, content, message, expectedHeadSha) {
  const { owner, repo } = parseRepo(repoRef); if (branch !== ASTRA_WORKING_BRANCH) throw new Error(`Commits require ${ASTRA_WORKING_BRANCH}.`);
  await createBranch(token, repoRef, branch);
  const refPath = `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const branchRef = await github(token, refPath); const parentSha = branchRef.object.sha;
  if (expectedHeadSha && parentSha !== expectedHeadSha) throw new Error('The repository changed during this chat turn. Stop and review the new branch state before editing.');
  const parentCommit = await github(token, `/repos/${owner}/${repo}/git/commits/${parentSha}`);
  const blob = await github(token, `/repos/${owner}/${repo}/git/blobs`, { method: 'POST', body: JSON.stringify({ content, encoding: 'utf-8' }) });
  const tree = await github(token, `/repos/${owner}/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: [{ path, mode: '100644', type: 'blob', sha: blob.sha }] }) });
  const commit = await github(token, `/repos/${owner}/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }) });
  await github(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  return { path, branch, commit: commit.sha, url: `https://github.com/${owner}/${repo}/compare/${await defaultBranch(token, repoRef)}...${branch}` };
}