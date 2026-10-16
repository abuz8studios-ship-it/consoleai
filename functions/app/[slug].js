import { serviceAuth, sbOne, sbList, parseFields, escHtml } from "../_lib/consoleai.js";

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(title)} · ConsoleAI</title>
<style>body{margin:0;background:#081423;color:#f2ecdc;font:15px/1.55 Inter,Segoe UI,Arial,sans-serif}main{max-width:980px;margin:0 auto;padding:28px 18px}.brand{color:#24b8a1;font-size:.72rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase}h1{font-family:Georgia,serif;color:#fff;margin:.2em 0}.card{background:#0d2038;border:1px solid #294b70;border-radius:16px;padding:18px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #294b70;padding:7px;text-align:left;vertical-align:top}a{color:#e4c877}.muted{color:#b8c7d5}</style></head>
<body><main><div class="brand">ABUZ8 · ConsoleAI published App</div><h1>${escHtml(title)}</h1>${body}<p class="muted"><a href="/">Open ConsoleAI</a> · support@abuz8ai.com</p></main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// Public page for a PUBLISHED App. Publishing is an approval-gated owner act;
// anything in a published App's records is world-readable on this route.
// Requires the service-role secret because RLS correctly hides rows from anon.
export async function onRequestGet({ env, params }) {
  const slug = String(params?.slug || "");
  const auth = serviceAuth(env);
  if (!auth) {
    return page("App page not configured", `<div class="card"><p>This App's public page is not configured yet. The workspace owner must set the <code>SUPABASE_SERVICE_ROLE_KEY</code> Pages secret to enable public pages for <b>published</b> Apps.</p><p class="muted">Signed-in members can open every App inside ConsoleAI itself. Nothing private is exposed by this notice.</p></div>`, 503);
  }
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) return page("App not found", `<div class="card"><p>No published App lives at this address.</p></div>`, 404);
  const app = await sbOne(env, auth, "apps", { slug: `eq.${slug}`, status: "eq.published" });
  if (!app) return page("App not found", `<div class="card"><p>No published App lives at this address. It may be a draft — drafts never render publicly.</p></div>`, 404);
  const records = await sbList(env, auth, "app_records", { app_id: `eq.${app.id}`, order: "created_at.asc", limit: 500 });
  const fields = parseFields(app.fields || []);
  const rows = records.map((r) => `<tr><td><b>${escHtml(r.title)}</b></td>${fields.map((f) => `<td>${escHtml(String(r.values?.[f.key] ?? ""))}</td>`).join("")}<td>${escHtml(r.status)}</td></tr>`).join("");
  const body = `<p class="muted">${escHtml(app.description || "")}</p><div class="card">${records.length
    ? `<table><thead><tr><th>Record</th>${fields.map((f) => `<th>${escHtml(f.label)}</th>`).join("")}<th>Status</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p>No records yet.</p>`}<p class="muted">${records.length} records · published ${app.published_at ? escHtml(new Date(app.published_at).toLocaleString()) : ""} · kept current from the room where this App lives.</p></div>`;
  return page(app.name, body);
}
export async function onRequest({ request, env, params }) {
  if (request.method !== "GET") return page("Method not allowed", `<div class="card"><p>Use GET.</p></div>`, 405);
  return onRequestGet({ env, params });
}
