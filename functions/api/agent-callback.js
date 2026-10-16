import { json, serviceAuth, loadDispatchContext, applyAgentResult, failDispatch, timingSafeEqual } from "../_lib/consoleai.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Long-running agents POST their result here instead of holding the dispatch
// request open. Requires owner-set secrets; until then this honestly says 503.
export async function onRequestPost({ request, env }) {
  const auth = serviceAuth(env);
  if (!auth || !env.CONSOLEAI_CALLBACK_SECRET) {
    return json({
      ok: false,
      error: "Agent callback is not configured on this deployment. The owner must set SUPABASE_SERVICE_ROLE_KEY and CONSOLEAI_CALLBACK_SECRET as Pages secrets, then give agents only the callback token.",
      needs: ["SUPABASE_SERVICE_ROLE_KEY", "CONSOLEAI_CALLBACK_SECRET"],
    }, 503);
  }
  const token = request.headers.get("x-consoleai-token") || "";
  if (!timingSafeEqual(token, env.CONSOLEAI_CALLBACK_SECRET)) return json({ ok: false, error: "Invalid callback token." }, 401);
  let body = null;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body must be JSON." }, 400); }
  const dispatchId = String(body?.dispatch_id || "");
  if (!UUID.test(dispatchId)) return json({ ok: false, error: "A valid dispatch_id (uuid) is required." }, 400);
  try {
    const { dispatch, agent, jacket } = await loadDispatchContext(env, auth, dispatchId);
    if (dispatch.status === "completed") return json({ ok: true, dispatch_id: dispatchId, status: "completed", already: true });
    const status = String(body?.status || "completed");
    if (status === "errored") {
      const r = await failDispatch(env, auth, { dispatch, status: "errored", message: String(body?.error || body?.output || "Agent reported an error via callback.").slice(0, 2000) });
      return json({ ok: true, dispatch_id: dispatchId, ...r });
    }
    const outputText = String(body?.output ?? body?.result ?? body?.text ?? "").slice(0, 12000);
    const r = await applyAgentResult(env, auth, { dispatch, agent, jacket, actorUserId: dispatch.dispatched_by, outputText, parsed: body, httpStatus: null });
    return json({ ok: true, dispatch_id: dispatchId, ...r });
  } catch (e) {
    return json({ ok: false, error: e.message || "Callback failed." }, 500);
  }
}
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed. Use POST." }, 405);
  return onRequestPost({ request, env });
}
