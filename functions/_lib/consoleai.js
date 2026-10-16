// ConsoleAI backend shared library (Cloudflare Pages Functions).
// RLS discipline: user-initiated work runs with the caller's Supabase JWT, so
// Postgres RLS still decides every row. Service-role paths (agent callback,
// automation runner, public published Apps) exist only when the owner sets
// SUPABASE_SERVICE_ROLE_KEY as a Pages secret; otherwise they answer 503.

export const SB_URL_DEFAULT = "https://fetsmubjgyzsuwiubepj.supabase.co";
export const SB_PUBLISHABLE_DEFAULT = "sb_publishable_xwqGPjS9_WWB6tk1AoEWDQ_T39R15oF"; // public by design; RLS decides rows

export function sbUrl(env) { return env.SUPABASE_URL || SB_URL_DEFAULT; }
export function sbPublishable(env) { return env.SUPABASE_PUBLISHABLE_KEY || SB_PUBLISHABLE_DEFAULT; }
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
export function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function slugify(v) {
  return String(v || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63);
}
export function fieldKey(label) {
  return String(label || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
}
export function parseFields(v) {
  if (Array.isArray(v)) return v.map((f) => typeof f === "string"
    ? { key: fieldKey(f), label: String(f).slice(0, 60), type: "text" }
    : { key: fieldKey(f.key || f.label || "field"), label: String(f.label || f.key || "Field").slice(0, 60), type: String(f.type || "text").slice(0, 20) }).slice(0, 12);
  return String(v || "").split(",").map((x) => x.trim()).filter(Boolean).map((label) => ({ key: fieldKey(label), label: label.slice(0, 60), type: "text" })).slice(0, 12);
}

// auth = { apikey, token } — user mode: publishable + user JWT; service mode: service key twice.
export function userAuth(env, token) { return { apikey: sbPublishable(env), token }; }
export function serviceAuth(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  return key ? { apikey: key, token: key } : null;
}

export async function sbReq(env, auth, { method = "GET", table, query = {}, body = null, prefer = "" } = {}) {
  const url = new URL(`${sbUrl(env)}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
    else if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const headers = { apikey: auth.apikey, authorization: `Bearer ${auth.token}`, "content-type": "application/json" };
  if (prefer) headers.prefer = prefer;
  const r = await fetch(url.toString(), { method, headers, body: body === null ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
  return { status: r.status, ok: r.ok, data };
}
function need(res, what) {
  if (!res.ok) throw new Error(`${what} failed (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`);
  return res.data;
}
export async function sbList(env, auth, table, query) {
  const d = need(await sbReq(env, auth, { table, query: { select: "*", ...query } }), `Load ${table}`);
  return Array.isArray(d) ? d : [];
}
export async function sbOne(env, auth, table, query) {
  const rows = await sbList(env, auth, table, { ...query, limit: 1 });
  return rows[0] || null;
}
export async function sbInsert(env, auth, table, row) {
  const d = need(await sbReq(env, auth, { method: "POST", table, body: row, prefer: "return=representation" }), `Insert ${table}`);
  return Array.isArray(d) ? d[0] : d;
}
export async function sbPatch(env, auth, table, query, patch) {
  return need(await sbReq(env, auth, { method: "PATCH", table, query, body: patch, prefer: "return=representation" }), `Update ${table}`);
}

export async function getUser(env, request) {
  const m = String(request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  const r = await fetch(`${sbUrl(env)}/auth/v1/user`, { headers: { apikey: sbPublishable(env), authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  return user?.id ? { user, token } : null;
}

export async function lastSequence(env, auth, dispatchId) {
  const rows = await sbList(env, auth, "run_steps", { dispatch_id: `eq.${dispatchId}`, order: "sequence.desc", limit: 1 });
  return rows[0]?.sequence || 0;
}
export async function addStep(env, auth, dispatchId, sequence, kind, status, summary, output = {}) {
  await sbInsert(env, auth, "run_steps", { dispatch_id: dispatchId, sequence, kind, status, summary: String(summary || "").slice(0, 2000), output });
}

export async function loadDispatchContext(env, auth, dispatchId) {
  const dispatch = await sbOne(env, auth, "dispatches", { id: `eq.${dispatchId}` });
  if (!dispatch) throw new Error("Dispatch not found, or your grants do not include its jacket.");
  const [agent, jacket] = await Promise.all([
    sbOne(env, auth, "agents", { id: `eq.${dispatch.agent_id}` }),
    sbOne(env, auth, "job_jackets", { id: `eq.${dispatch.jacket_id}` }),
  ]);
  if (!agent || !jacket) throw new Error("Dispatch agent/jacket could not be loaded under your grants.");
  return { dispatch, agent, jacket };
}

async function loadPacketContext(env, auth, { jacket, agent }) {
  const out = { room: null, memories: [], apps: [], connections_granted: [] };
  try {
    if (jacket.room_id) {
      out.room = await sbOne(env, auth, "rooms", { id: `eq.${jacket.room_id}` });
    }
    const mems = await sbList(env, auth, "memories", { console_id: `eq.${jacket.console_id}`, order: "created_at.desc", limit: 50 });
    out.memories = mems.filter((m) => m.scope === "console" || (jacket.room_id && m.room_id === jacket.room_id) || m.agent_id === agent.id)
      .slice(0, 20).map((m) => ({ kind: m.kind, title: m.title, body: m.body }));
    const apps = await sbList(env, auth, "apps", { console_id: `eq.${jacket.console_id}` });
    out.apps = apps.filter((a) => !jacket.room_id || a.home_room_id === jacket.room_id)
      .map((a) => ({ id: a.id, name: a.name, slug: a.slug, kind: a.kind, status: a.status }));
    const grants = await sbList(env, auth, "connection_grants", { agent_id: `eq.${agent.id}` });
    if (grants.length) {
      const conns = await sbList(env, auth, "connections", { id: `in.(${grants.map((g) => g.connection_id).join(",")})` });
      out.connections_granted = grants.map((g) => {
        const c = conns.find((x) => x.id === g.connection_id);
        return c ? { name: c.name, kind: c.kind, status: c.status, access: g.access, scopes: c.scopes } : null;
      }).filter(Boolean);
    }
  } catch { /* context is best-effort; the work packet core still ships */ }
  return out;
}

export async function ensureJacketThread(env, auth, jacket, actorUserId) {
  if (!jacket?.room_id) return null;
  const found = await sbOne(env, auth, "threads", { room_id: `eq.${jacket.room_id}`, anchor_type: "eq.jacket", anchor_id: `eq.${jacket.id}` });
  if (found) return found;
  return sbInsert(env, auth, "threads", { room_id: jacket.room_id, created_by: actorUserId, title: `Jacket: ${jacket.title}`.slice(0, 120), anchor_type: "jacket", anchor_id: jacket.id });
}

export async function agentInRoom(env, auth, roomId, agentId) {
  if (!roomId || !agentId) return false;
  const rows = await sbList(env, auth, "room_members", { room_id: `eq.${roomId}`, agent_id: `eq.${agentId}`, limit: 1 });
  return rows.length > 0;
}

export async function createAppFromPayload(env, auth, { rawApp, actorUserId, agent, jacket, dispatch }) {
  if (!rawApp || typeof rawApp !== "object" || !String(rawApp.name || "").trim()) return null;
  const fields = parseFields(rawApp.fields || []);
  const slug = slugify(rawApp.slug || rawApp.name);
  if (!slug || slug.length < 2) return null;
  let app = await sbOne(env, auth, "apps", { console_id: `eq.${jacket.console_id}`, slug: `eq.${slug}` });
  if (!app) {
    app = await sbInsert(env, auth, "apps", {
      console_id: jacket.console_id, home_room_id: jacket.room_id || null,
      created_by: actorUserId, created_by_agent: agent?.id || null, source_dispatch_id: dispatch?.id || null,
      name: String(rawApp.name).slice(0, 120), slug,
      kind: ["tracker", "board", "dashboard", "form_page", "custom"].includes(rawApp.kind) ? rawApp.kind : "custom",
      description: String(rawApp.description || "").slice(0, 2000), fields, visibility: "room", status: "draft",
    });
    try { await sbInsert(env, auth, "app_views", { app_id: app.id, created_by: actorUserId, name: app.kind === "board" ? "Board" : "Table", view_kind: app.kind === "board" ? "board" : "table", is_default: true }); } catch { /* view is cosmetic */ }
    if (jacket.room_id) {
      try { await sbInsert(env, auth, "app_links", { app_id: app.id, room_id: jacket.room_id, created_by: actorUserId }); } catch { /* duplicate link is fine */ }
    }
  }
  const recs = Array.isArray(rawApp.records) ? rawApp.records.slice(0, 50) : [];
  let inserted = 0;
  for (const r of recs) {
    if (!r || !String(r.title || "").trim()) continue;
    try {
      await sbInsert(env, auth, "app_records", {
        app_id: app.id, created_by: actorUserId, created_by_agent: agent?.id || null,
        source_dispatch_id: dispatch?.id || null, title: String(r.title).slice(0, 200),
        status: String(r.status || "open").slice(0, 40),
        values: (r.values && typeof r.values === "object" && !Array.isArray(r.values)) ? r.values : {},
      });
      inserted += 1;
    } catch { /* skip a bad record, keep the App */ }
  }
  return { app, inserted };
}

async function chargeIfLedger(env, auth, { jacket, dispatch, actorUserId }) {
  const est = Number(dispatch.estimated_credits || 0);
  if (!est || est <= 0) return false;
  const any = await sbList(env, auth, "credit_ledger", { console_id: `eq.${jacket.console_id}`, limit: 1 });
  if (!any.length) return false;
  try {
    await sbInsert(env, auth, "credit_ledger", {
      console_id: jacket.console_id, created_by: actorUserId, jacket_id: jacket.id, dispatch_id: dispatch.id,
      entry_kind: "dispatch_charge", credits: -est, note: "Completed dispatch charge (server runner, test ledger)",
      idempotency_key: `dispatch:${dispatch.id}`,
    });
    return true;
  } catch { return false; }
}

// Shared success path for the server runner and the async agent callback.
export async function applyAgentResult(env, auth, { dispatch, agent, jacket, actorUserId, outputText, parsed, httpStatus = null }) {
  let seq = await lastSequence(env, auth, dispatch.id);
  await addStep(env, auth, dispatch.id, ++seq, "agent_response", "completed", "Agent endpoint returned a response (server-side).", { http_status: httpStatus, output: String(outputText || "").slice(0, 2000) });
  await sbPatch(env, auth, "dispatches", { id: `eq.${dispatch.id}` }, {
    status: "completed", finished_at: new Date().toISOString(),
    response_payload: parsed || { text: String(outputText || "").slice(0, 8000) },
    response_text: String(outputText || "").slice(0, 12000), error_text: "",
  });
  await sbPatch(env, auth, "job_jackets", { id: `eq.${jacket.id}` }, { state: "evidence_open" }).catch(() => null);
  let created = null;
  try {
    const rawApp = parsed?.app || (Array.isArray(parsed?.apps) ? parsed.apps[0] : null);
    if (rawApp) {
      created = await createAppFromPayload(env, auth, { rawApp, actorUserId, agent, jacket, dispatch });
      if (created) await addStep(env, auth, dispatch.id, ++seq, "app_create", "completed", `Agent returned an App: ${created.app.name} (${created.inserted} new records).`, { app_id: created.app.id });
    }
  } catch (e) {
    try { await addStep(env, auth, dispatch.id, ++seq, "app_create", "errored", `App payload rejected: ${e.message}`, {}); } catch { /* ignore */ }
  }
  try {
    const thread = await ensureJacketThread(env, auth, jacket, actorUserId);
    if (thread) {
      const asAgent = await agentInRoom(env, auth, jacket.room_id, agent.id);
      await sbInsert(env, auth, "messages", {
        thread_id: thread.id, author_profile_id: actorUserId, author_agent_id: asAgent ? agent.id : null,
        kind: "agent_output", body: String(outputText || "(empty agent response)").slice(0, 12000),
      });
      if (created) {
        await sbInsert(env, auth, "messages", {
          thread_id: thread.id, author_profile_id: actorUserId, author_agent_id: asAgent ? agent.id : null,
          kind: "app_card", body: `app:${created.app.id}\n${created.app.name} — built by ${agent.display_name} · ${created.app.status}`,
        });
      }
    }
  } catch { /* thread evidence is important but must not erase a completed dispatch */ }
  await chargeIfLedger(env, auth, { jacket, dispatch, actorUserId }).catch(() => false);
  return { status: "completed", app_id: created?.app?.id || null };
}

export async function failDispatch(env, auth, { dispatch, status, message }) {
  let seq = await lastSequence(env, auth, dispatch.id).catch(() => 1);
  try { await addStep(env, auth, dispatch.id, ++seq, "agent_response", status, message, {}); } catch { /* ignore */ }
  await sbPatch(env, auth, "dispatches", { id: `eq.${dispatch.id}` }, { status, finished_at: new Date().toISOString(), error_text: String(message).slice(0, 2000) }).catch(() => null);
  return { status };
}

// The real server-side dispatch runner. Never fakes completion.
export async function executeDispatchCore(env, auth, dispatchId, actorUserId) {
  const { dispatch, agent, jacket } = await loadDispatchContext(env, auth, dispatchId);
  if (dispatch.status === "completed") return { status: "completed", already: true };
  const ctx = await loadPacketContext(env, auth, { jacket, agent });
  const payload = {
    event: "consoleai.dispatch.v1", dispatch_id: dispatch.id, parent_dispatch_id: dispatch.parent_dispatch_id,
    handoff_note: dispatch.handoff_note, mode: dispatch.mode, instructions: dispatch.instructions,
    jacket: { id: jacket.id, title: jacket.title, brief: jacket.brief, acceptance_criteria: jacket.acceptance_criteria, budget_cap_credits: jacket.budget_cap_credits },
    agent: { id: agent.id, slug: agent.slug, kind: agent.kind, brain_model: agent.brain_model, capabilities: agent.capabilities, instructions: agent.instructions },
    room: ctx.room ? { id: ctx.room.id, name: ctx.room.name, guidelines: ctx.room.guidelines } : null,
    memories: ctx.memories, apps: ctx.apps, connections_granted: ctx.connections_granted,
    callback: { url: "https://oasis.abuz8ai.com/api/agent-callback", note: "For long work, POST the result here with the x-consoleai-token your operator configured. Body: {dispatch_id,status:completed|errored,output,app?}." },
    response_contract: { output: "string — what happened, with evidence", app: "optional {name,kind,description,fields:[labels],records:[{title,status,values}]} to create/update a living App in the room. Drafts only for external sends; a human approves publishing." },
  };
  await sbPatch(env, auth, "dispatches", { id: `eq.${dispatch.id}` }, { status: "running", started_at: new Date().toISOString(), request_payload: payload, endpoint_snapshot: agent.endpoint_url || null });
  let seq = await lastSequence(env, auth, dispatch.id);
  await addStep(env, auth, dispatch.id, ++seq, "dispatch", "running", agent.endpoint_url ? "Server runner sending work packet to agent endpoint." : "No endpoint configured.", {});
  if (!agent.endpoint_url) {
    const msg = "No endpoint configured. Work packet is safely halted; configure an endpoint, then replay.";
    await addStep(env, auth, dispatch.id, ++seq, "verify", "safely_halted", msg, {});
    await sbPatch(env, auth, "dispatches", { id: `eq.${dispatch.id}` }, { status: "safely_halted", finished_at: new Date().toISOString(), error_text: msg });
    return { status: "safely_halted" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  try {
    const response = await fetch(agent.endpoint_url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
    const raw = await response.text();
    let parsed = null; try { parsed = JSON.parse(raw); } catch { /* plain text is acceptable output */ }
    const outputText = String(parsed?.output ?? parsed?.result ?? parsed?.text ?? parsed?.message ?? raw ?? "").slice(0, 12000);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 400)}`);
    return await applyAgentResult(env, auth, { dispatch, agent, jacket, actorUserId, outputText, parsed, httpStatus: response.status });
  } catch (e) {
    const msg = e.name === "AbortError"
      ? "Agent endpoint did not answer within 55s on the server runner. Long jobs should accept the packet and POST the result to the callback URL in the packet."
      : `Endpoint failed (${e.name}: ${e.message}).`;
    return await failDispatch(env, auth, { dispatch, status: "errored", message: msg });
  } finally {
    clearTimeout(timer);
  }
}

export function timingSafeEqual(a, b) {
  const x = String(a || ""), y = String(b || "");
  if (!x || x.length !== y.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return out === 0;
}
