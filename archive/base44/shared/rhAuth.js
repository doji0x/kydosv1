import { secrets } from "base44:runtime";

function sameSecret(provided, expected) {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function isCronRequest(req, allowBody = true) {
  const expected = secrets.get("RH_CRON_SECRET");
  const body = allowBody ? await req.clone().json().catch(() => ({})) : {};
  const provided = req.headers.get("x-kydos-cron") || body?.secret || "";
  return sameSecret(String(provided), String(expected || ""));
}

// Engine operations require either an authenticated admin or the private cron secret.
export async function assertEngineCaller(base44, req) {
  const user = await base44.auth.me().catch(() => null);
  if (user) {
    return user.role === "admin"
      ? null
      : Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return (await isCronRequest(req))
    ? null
    : Response.json({ error: "Unauthorized" }, { status: 401 });
}