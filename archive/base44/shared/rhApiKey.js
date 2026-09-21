// Access gate for the public Kydos market-data API.
//
// Third parties authenticate with the x-kydos-api-key header. The Kydos UI calls the
// same functions through the SDK as a signed-in app user, so an authenticated caller
// is allowed through without a key.
import { secrets } from "base44:runtime";

function expectedKey() {
  try {
    return secrets.get("KYDOS_API_KEY") || null;
  } catch {
    return null;
  }
}

/**
 * Returns a 401 Response when the caller may not read the API, or null when allowed.
 */
export async function assertApiCaller(base44, req) {
  const presented = req.headers.get("x-kydos-api-key");
  if (presented) {
    const expected = expectedKey();
    if (expected && presented === expected) return null;
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const user = await base44.auth.me().catch(() => null);
  if (user) return null;

  return Response.json(
    { error: "Unauthorized — send your key in the x-kydos-api-key header" },
    { status: 401 }
  );
}