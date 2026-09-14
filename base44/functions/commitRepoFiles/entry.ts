import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { githubApi, githubToken, repoSlug } from "../../shared/github.js";
import { FILES } from "../../shared/repoDocs.js";

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const overwrite = body.overwrite === true;

    const repo = repoSlug();
    const token = await githubToken(base44);
    const info = await githubApi(token, `/repos/${repo}`);
    const branch = info.default_branch;

    const results = [];
    for (const file of FILES) {
      const existing = await githubApi(
        token,
        `/repos/${repo}/contents/${file.path}?ref=${branch}`,
      ).catch(() => null);

      if (existing && !overwrite) {
        results.push({ path: file.path, status: "skipped" });
        continue;
      }

      await githubApi(token, `/repos/${repo}/contents/${file.path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: file.message,
          content: toBase64(file.content),
          branch,
          ...(existing ? { sha: existing.sha } : {}),
        }),
      });
      results.push({ path: file.path, status: existing ? "updated" : "created" });
    }

    return Response.json({ ok: true, repo, branch, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}