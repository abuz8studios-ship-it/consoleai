// ConsoleAI cron runner: every 5 minutes, ask the Pages backend to run any
// due automations. Inert (and honest about it) until the owner sets the
// CONSOLEAI_CRON_SECRET Worker secret to match the Pages secret.
export default {
  async scheduled(_event, env, _ctx) {
    const url = env.RUN_DUE_URL || "https://oasis.abuz8ai.com/api/run-due";
    if (!env.CONSOLEAI_CRON_SECRET) {
      console.log("consoleai-runner: CONSOLEAI_CRON_SECRET is not set; skipping. The backend remains un-run, by design.");
      return;
    }
    const r = await fetch(url, { method: "POST", headers: { "x-cron-secret": env.CONSOLEAI_CRON_SECRET } });
    console.log(`consoleai-runner: POST ${url} -> HTTP ${r.status} ${(await r.text()).slice(0, 500)}`);
  },
  async fetch(_request, env) {
    return Response.json({
      ok: true,
      service: "consoleai-runner",
      cron_secret_configured: Boolean(env.CONSOLEAI_CRON_SECRET),
      run_due_url: env.RUN_DUE_URL || "https://oasis.abuz8ai.com/api/run-due",
      schedule: "*/5 * * * *",
    }, { headers: { "cache-control": "no-store" } });
  },
};
