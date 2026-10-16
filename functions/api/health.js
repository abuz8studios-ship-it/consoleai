import { json } from "../_lib/consoleai.js";

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    service: "consoleai-backend",
    version: "1.0.0",
    time: new Date().toISOString(),
    supabase_configured: true,
    service_role_configured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    cron_secret_configured: Boolean(env.CONSOLEAI_CRON_SECRET),
    callback_secret_configured: Boolean(env.CONSOLEAI_CALLBACK_SECRET),
    routes: [
      "POST /api/dispatch (signed-in user JWT; server-side agent runner)",
      "POST /api/agent-callback (x-consoleai-token; needs service-role secret)",
      "POST /api/run-due (x-cron-secret; needs service-role secret)",
      "GET /app/:slug (published App page; needs service-role secret)",
      "GET /api/health",
    ],
  });
}
export async function onRequest({ request, env }) {
  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed. Use GET." }, 405);
  return onRequestGet({ env });
}
