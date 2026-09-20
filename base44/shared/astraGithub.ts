const apiBase = 'https://api.github.com';
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
export async function createBranch(token, repoRef, branch) {
  const { owner, repo } = parseRepo(repoRef); if (!branch.startsWith('astra/')) throw new Error('Astra branches must start with astra/.');
  const base = await defaultBranch(token, repoRef); const existing = await github(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`).catch(() => null);
  if (existing) return { branch, created: false, base };
  const ref = await github(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
  await github(token, `/repos/${owner}/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }) });
  return { branch, created: true, base };
}
export async function commitFile(token, repoRef, branch, path, content, message) {
  const { owner, repo } = parseRepo(repoRef); if (!branch.startsWith('astra/')) throw new Error('Commits require an astra/* branch.');
  await createBranch(token, repoRef, branch); const current = await readFile(token, repoRef, path, branch).catch(() => null);
  const bytes = new TextEncoder().encode(content); let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  const request = () => github(token, `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: JSON.stringify({ message, content: btoa(binary), branch, ...(current ? { sha: current.sha } : {}) }) });
  let result; let firstError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { result = await request(); break; }
    catch (error) {
      firstError ||= error;
      if (![404, 409].includes(error.status) || attempt === 2) throw attempt === 2 ? firstError : error;
      await new Promise(resolve => setTimeout(resolve, 700));
    }
  }
  return { path, branch, commit: result.commit?.sha, url: `https://github.com/${owner}/${repo}/compare/${await defaultBranch(token, repoRef)}...${branch}` };
}