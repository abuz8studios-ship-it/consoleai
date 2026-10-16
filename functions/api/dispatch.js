import { json, getUser, userAuth, executeDispatchCore } from "../_lib/consoleai.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestPost({ request, env }) {
  const who = await getUser(env, request);
  if (!who) return json({ ok: false, error: "Sign in first. Send your Supabase session as an Authorization: Bearer token." }, 401);
  let body = null;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body must be JSON: {dispatch_id}." }, 400); }
  const dispatchId = String(body?.dispatch_id || "");
  if (!UUID.test(dispatchId)) return json({ ok: false, error: "A valid dispatch_id (uuid) is required." }, 400);
  try {
    const result = await executeDispatchCore(env, userAuth(env, who.token), dispatchId, who.user.id);
    return json({ ok: true, runner: "cloudflare-pages-function", dispatch_id: dispatchId, ...result });
  } catch (e) {
    return json({ ok: false, error: e.message || "Dispatch runner failed before completion." }, 500);
  }
}
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed. Use POST." }, 405);
  return onRequestPost({ request, env });
}
