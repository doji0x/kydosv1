// Guard for the indexer/engine functions: scheduled workflow runs have no user and are
// allowed; a request made by a signed-in user must come from an admin.
export async function assertEngineCaller(base44) {
  let user = null;
  try {
    user = await base44.auth.me();
  } catch {
    user = null;
  }
  if (user && user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}