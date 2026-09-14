// Shared GitHub API helper for the deployment-release log.
import { secrets } from "base44:runtime";

const DEFAULT_REPO = "doji0x/Kydos";

export function repoSlug() {
  try {
    return secrets.get("GH_REPO") || DEFAULT_REPO;
  } catch {
    return DEFAULT_REPO;
  }
}

export async function githubToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("github");
  return accessToken;
}

export async function githubApi(token, path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "kydos-release-log",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json.message || `GitHub API ${res.status}`);
  return json;
}