import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { assertGithubAdmin, githubApi, githubToken, repoSlug } from "../../shared/github.js";

function tagFor(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `v${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}`;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertGithubAdmin(base44);
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));

    const when = body.published_at ? new Date(body.published_at) : new Date();
    const stamp = isNaN(when.getTime()) ? new Date() : when;
    const tag = tagFor(stamp);
    const repo = repoSlug();
    const token = await githubToken(base44);

    const meta = [
      `Kydos app published at ${stamp.toISOString()}.`,
      body.visibility ? `Visibility: ${body.visibility}` : null,
      body.is_first_publish ? "First publish of the app." : null,
      body.published_by ? `Published by: ${body.published_by}` : null,
    ].filter(Boolean);

    // Changelog: commits landed since the previous release tag.
    const previous = await githubApi(token, `/repos/${repo}/releases?per_page=1`).catch(() => []);
    const prevTag = previous?.[0]?.tag_name;
    let changelog = ["", "### Changes"];

    if (!prevTag) {
      changelog.push("- Initial release — no previous deployment to compare against.");
    } else {
      const diff = await githubApi(
        token,
        `/repos/${repo}/compare/${encodeURIComponent(prevTag)}...HEAD`,
      ).catch(() => null);
      const commits = diff?.commits || [];
      if (commits.length === 0) {
        changelog.push(`- No code changes since \`${prevTag}\`.`);
      } else {
        for (const c of commits.slice(-30).reverse()) {
          changelog.push(`- ${c.commit.message.split("\n")[0]}`);
        }
        if (commits.length > 30) changelog.push(`- …and ${commits.length - 30} earlier commits.`);
        changelog.push("", `Compare: ${diff.html_url}`);
      }
    }

    const notes = [...meta, ...changelog].join("\n");

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