import { json, serviceAuth, sbList, sbOne, sbInsert, sbPatch, executeDispatchCore, timingSafeEqual } from "../_lib/consoleai.js";

// Background automation runner, called by the consoleai-runner cron Worker
// (or any scheduler) every few minutes. Requires owner-set secrets.
export async function onRequestPost({ request, env }) {
  const auth = serviceAuth(env);
  if (!auth || !env.CONSOLEAI_CRON_SECRET) {
    return json({
      ok: false,
      error: "Automation runner is not configured on this deployment. The owner must set SUPABASE_SERVICE_ROLE_KEY and CONSOLEAI_CRON_SECRET as Pages secrets (and the same cron secret on the runner Worker).",
      needs: ["SUPABASE_SERVICE_ROLE_KEY", "CONSOLEAI_CRON_SECRET"],
    }, 503);
  }
  const secret = request.headers.get("x-cron-secret") || "";
  if (!timingSafeEqual(secret, env.CONSOLEAI_CRON_SECRET)) return json({ ok: false, error: "Invalid cron secret." }, 401);
  try {
    const now = new Date();
    const active = await sbList(env, auth, "automations", { status: "eq.active", order: "created_at.asc", limit: 50 });
    const due = active.filter((x) => x.trigger_kind === "schedule" && (!x.next_run_at || new Date(x.next_run_at) <= now));
    const ran = [], skipped = [];
    for (const auto of due.slice(0, 10)) {
      if (!auto.jacket_id || !auto.agent_id) { skipped.push({ id: auto.id, why: "needs both a jacket and an agent to run headlessly" }); continue; }
      const intervalMin = Number(auto.config?.interval_minutes || 1440);
      const next = new Date(now.getTime() + Math.max(5, intervalMin) * 60000).toISOString();
      const dispatch = await sbInsert(env, auth, "dispatches", {
        jacket_id: auto.jacket_id, agent_id: auto.agent_id, dispatched_by: auto.created_by,
        mode: "deterministic", instructions: auto.instructions || auto.name,
        estimated_credits: Math.min(Number(auto.budget_credits || 0), 1000), status: "queued",
      });
      const result = await executeDispatchCore(env, auth, dispatch.id, auto.created_by);
      const failed = result.status !== "completed";
      await sbPatch(env, auth, "automations", { id: `eq.${auto.id}` }, {
        last_run_at: now.toISOString(), next_run_at: next, fail_count: failed ? (auto.fail_count || 0) + 1 : 0,
      }).catch(() => null);
      ran.push({ automation: auto.id, dispatch: dispatch.id, status: result.status });
      void sbOne; // (kept import surface small and explicit)
    }
    return json({ ok: true, considered: active.length, due: due.length, ran, skipped });
  } catch (e) {
    return json({ ok: false, error: e.message || "Run-due failed." }, 500);
  }
}
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed. Use POST." }, 405);
  return onRequestPost({ request, env });
}
