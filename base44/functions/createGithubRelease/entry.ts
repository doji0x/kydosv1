import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { githubApi, githubToken, repoSlug } from "../../shared/github.js";

function tagFor(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `v${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}`;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const when = body.published_at ? new Date(body.published_at) : new Date();
    const stamp = isNaN(when.getTime()) ? new Date() : when;
    const tag = tagFor(stamp);
    const repo = repoSlug();
    const token = await githubToken(base44);

    const notes = [
      `Kydos app published at ${stamp.toISOString()}.`,
      body.visibility ? `Visibility: ${body.visibility}` : null,
      body.is_first_publish ? "First publish of the app." : null,
      body.published_by ? `Published by: ${body.published_by}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const release = await githubApi(token, `/repos/${repo}/releases`, {
      method: "POST",
      body: JSON.stringify({
        tag_name: tag,
        name: `Deployment ${stamp.toISOString().slice(0, 16).replace("T", " ")} UTC`,
        body: notes,
        draft: false,
        prerelease: false,
      }),
    });

    return Response.json({ ok: true, tag, url: release.html_url, id: release.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}