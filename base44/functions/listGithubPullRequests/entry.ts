import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { assertGithubAdmin, githubApi, githubToken, repoSlug } from "../../shared/github.js";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertGithubAdmin(base44);
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 20, 50);
    const state = ["open", "closed", "all"].includes(body.state) ? body.state : "all";

    const repo = repoSlug();
    const token = await githubToken(base44);
    const prs = await githubApi(
      token,
      `/repos/${repo}/pulls?state=${state}&sort=updated&direction=desc&per_page=${limit}`,
    );

    return Response.json({
      repo,
      pulls: (prs || []).map((p) => ({
        id: p.id,
        number: p.number,
        title: p.title,
        state: p.merged_at ? "merged" : p.state,
        draft: p.draft,
        author: p.user?.login,
        author_avatar: p.user?.avatar_url,
        branch: p.head?.ref,
        base: p.base?.ref,
        labels: (p.labels || []).map((l) => l.name),
        comments: p.review_comments ?? 0,
        url: p.html_url,
        created_at: p.created_at,
        updated_at: p.updated_at,
        merged_at: p.merged_at,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}