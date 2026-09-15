import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { assertGithubAdmin, githubApi, githubToken, repoSlug } from "../../shared/github.js";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertGithubAdmin(base44);
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 50);
    const repo = repoSlug();
    const token = await githubToken(base44);

    const releases = await githubApi(token, `/repos/${repo}/releases?per_page=${limit}`);

    return Response.json({
      repo,
      releases: (releases || []).map((r) => ({
        id: r.id,
        tag: r.tag_name,
        name: r.name,
        body: r.body || "",
        url: r.html_url,
        author: r.author?.login || null,
        prerelease: !!r.prerelease,
        draft: !!r.draft,
        published_at: r.published_at || r.created_at,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}