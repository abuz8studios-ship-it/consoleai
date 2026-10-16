import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.CONSOLEAI_CONFIG || {};
const $ = s => document.querySelector(s);
const statusEl = $("#status");
let supabase = null, currentUser = null, realtimeChannel = null;
let consoles = [], agents = [], rooms = [], roomMembers = [], threads = [], jackets = [], dispatches = [], stepsByDispatch = new Map();
let selectedConsoleId = localStorage.getItem("consoleai_console_id") || "";
let selectedRoomId = localStorage.getItem("consoleai_room_id") || "";
let selectedThreadId = localStorage.getItem("consoleai_thread_id") || "";
let selectedJacketId = localStorage.getItem("consoleai_jacket_id") || "";
let allDispatches = [];
let apps = [], appRecords = [], appLinks = [], appViews = [], stips = [], checks = [], approvals = [], credits = [], connections = [], connGrants = [], automations = [], memories = [], filesListData = [];
let selectedAppId = localStorage.getItem("consoleai_app_id") || "";
let appViewKind = localStorage.getItem("consoleai_app_view") || "table";

function say(msg, cls="") { statusEl.className = `status ${cls}`; statusEl.textContent = msg; }
function slugify(v) { return String(v || "").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,63); }
function esc(s) { const d=document.createElement("div"); d.textContent=String(s ?? ""); return d.innerHTML; }
function byId(list,id) { return list.find(x=>x.id===id); }
function parseCaps(v) { return [...new Set(String(v||"").split(",").map(x=>x.trim()).filter(Boolean))].slice(0,24); }
function excerpt(v,n=500) { const s=String(v||""); return s.length>n ? s.slice(0,n)+"…" : s; }
async function ensureProfile() {
  const display = $("#displayName").value.trim() || (currentUser.email || "ConsoleAI member").split("@")[0];
  const { error } = await supabase.from("profiles").upsert({ id: currentUser.id, display_name: display, actor_kind: "human" });
  if (error) throw error;
  return display;
}

async function loadProfile() {
  const { data, error } = await supabase.from("profiles").select("display_name, actor_kind").eq("id", currentUser.id).maybeSingle();
  if (error) throw error;
  if (data?.display_name) $("#displayName").value = data.display_name;
}


function showInspector(name) {
  document.querySelectorAll("[data-insp]").forEach(b=>b.classList.toggle("active", b.dataset.insp===name));
  document.querySelectorAll("[data-panel]").forEach(pn=>pn.classList.toggle("hidden", pn.dataset.panel!==name));
}
function renderInspector() {
  const ij=$("#inspectorJacket");
  if (ij) {
    const j=byId(jackets,selectedJacketId);
    ij.className = j ? "item" : "empty";
    ij.innerHTML = j ? `<div class="item-head"><b>${esc(j.title)}</b><span class="pill gold">${esc(j.state)}</span></div><div class="muted">Budget cap ${j.budget_cap_credits} credits · ${esc(j.visibility)}${j.room_id?' · room anchored':' · no room anchor'}</div><p>${esc(j.brief||'No brief yet.')}</p>${j.acceptance_criteria?`<p><b>Acceptance:</b> ${esc(j.acceptance_criteria)}</p>`:''}<p class="muted">Funding opens in the database only when every required CP4 check passes and every required stip is satisfied — see the Verify tab.</p>` : 'Select a jacket in the left rail.';
  }
  const im=$("#inspectorMembers");
  if (im) {
    const names=roomMembers.map(m=>{
      if (m.agent_id) { const a=byId(agents,m.agent_id); return `${esc(a?.display_name||'Agent')} <span class="pill">@${esc(a?.slug||'agent')}</span> · agent/${esc(m.role)}`; }
      return `${m.profile_id===currentUser?.id?'You':esc(String(m.profile_id||'').slice(0,8))} · human/${esc(m.role)}`;
    });
    im.className = names.length ? "item" : "empty";
    im.innerHTML = names.length ? names.join('<br>') : 'Select a room with members.';
  }
  renderMention();
}
function mentionAgent() {
  const m=String($("#messageBody")?.value||"").match(/@([a-z0-9][a-z0-9-]*)/i);
  if (!m) return null;
  return agents.find(a=>a.slug===m[1].toLowerCase()) || null;
}
function renderMention() {
  const el=$("#mentionTarget"); if (!el) return;
  const raw=String($("#messageBody")?.value||"");
  const m=raw.match(/@([a-z0-9][a-z0-9-]*)/i);
  if (!m) {
    const room=byId(rooms,selectedRoomId); const dflt=room?.default_agent_id?byId(agents,room.default_agent_id):null;
    el.textContent = dflt ? `No @mention. Room default is @${dflt.slug} — type @${dflt.slug} (or any @agent-slug) to target dispatch explicitly.` : "No @agent targeted and this room has no default agent. Unnamed messages stay human messages; dispatch is explicit.";
    return;
  }
  const a=mentionAgent();
  if (!a) { el.textContent=`@${m[1].toLowerCase()} does not match any registered agent slug in this console. Check the left rail.`; return; }
  const inRoom=roomMembers.some(x=>x.agent_id===a.id);
  el.textContent=`Target: @${a.slug} · ${a.display_name} · ${inRoom?'room member — dispatchable on the selected jacket':'NOT a room member yet — add it from the Agents list before dispatch.'}`;
  const sel=$("#dispatchAgent"); if (sel) sel.value=a.id;
}
function applyShellSearch() {
  const q=String($("#shellSearch")?.value||"").trim().toLowerCase();
  ["#roomList","#agentList","#jacketList"].forEach(sel=>{
    document.querySelectorAll(`${sel} .selectable, ${sel} .item`).forEach(el=>{
      el.style.display = (!q || el.textContent.toLowerCase().includes(q)) ? "" : "none";
    });
  });
}


function fieldKey(label){ return String(label||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,40)||"field"; }
function parseFields(v){
  if (Array.isArray(v)) return v.map(f=> typeof f==="string" ? {key:fieldKey(f),label:String(f).slice(0,60),type:"text"} : {key:fieldKey(f.key||f.label||"field"),label:String(f.label||f.key||"Field").slice(0,60),type:String(f.type||"text").slice(0,20)}).slice(0,12);
  return String(v||"").split(",").map(x=>x.trim()).filter(Boolean).map(label=>({key:fieldKey(label),label:label.slice(0,60),type:"text"})).slice(0,12);
}
function creditBalance(){ return credits.reduce((s,c)=>s+(c.credits||0),0); }
function recordsOf(appId){ return appRecords.filter(r=>r.app_id===appId); }
function renderMessage(m){
  const a=m.author_agent_id?byId(agents,m.author_agent_id):null;
  const who=esc(a?.display_name||(m.author_profile_id===currentUser?.id?'You':'Member'));
  const meta=`<div class="meta">${who} · ${new Date(m.created_at).toLocaleString()} · ${esc(m.kind)}</div>`;
  if (m.kind==='app_card') {
    const mm=String(m.body||"").match(/app:([0-9a-f-]{36})/i);
    const app=mm?byId(apps,mm[1]):null;
    if (app) {
      const recs=recordsOf(app.id);
      const rows=recs.slice(0,6).map(r=>`<div class="kv"><b>${esc(r.title)}</b> · ${esc(r.status)}${Object.entries(r.values||{}).slice(0,3).map(([k,v])=>` · ${esc(k)}: ${esc(String(v))}`).join("")}</div>`).join("")||'<div class="kv">No records yet.</div>';
      return `<div class="msg ${a?'agent':''}">${meta}<div class="appcard"><div class="item-head"><b>${esc(app.name)}</b><span class="pill ${app.status==='published'?'green':'gold'}">${esc(app.status)}</span></div><div class="muted">App · ${esc(app.kind)} · ${recs.length} records · one App, every linked context stays current</div>${rows}<div class="row" style="margin-top:8px"><button class="small secondary" data-open-app="${app.id}" type="button">Open App</button></div></div></div>`;
    }
  }
  return `<div class="msg ${a?'agent':''}">${meta}<div>${esc(m.body)}</div></div>`;
}
async function q(table, build){
  const r = await build(supabase.from(table).select("*"));
  if (r.error) throw r.error;
  return r.data||[];
}
async function loadVerify(){
  if (!selectedJacketId) { stips=[]; checks=[]; renderVerify(); return; }
  try {
    [stips, checks] = await Promise.all([
      q("stips", x=>x.eq("jacket_id",selectedJacketId).order("created_at",{ascending:true})),
      q("verify_checks", x=>x.eq("jacket_id",selectedJacketId).order("created_at",{ascending:true}))
    ]);
  } catch(e){ say(`Verify load failed: ${e.message}`,'err'); }
  renderVerify();
}
async function loadPlatform(){
  if (!currentUser || !selectedConsoleId) return;
  const jobs = [
    q("apps", x=>x.eq("console_id",selectedConsoleId).order("created_at",{ascending:true})).then(d=>{apps=d;}),
    q("approvals", x=>x.eq("console_id",selectedConsoleId).order("created_at",{ascending:false})).then(d=>{approvals=d;}),
    q("credit_ledger", x=>x.eq("console_id",selectedConsoleId).order("created_at",{ascending:false})).then(d=>{credits=d;}),
    q("connections", x=>x.eq("console_id",selectedConsoleId).order("created_at",{ascending:true})).then(d=>{connections=d;}),
    q("automations", x=>x.eq("console_id",selectedConsoleId).order("created_at",{ascending:false})).then(d=>{automations=d;}),
    q("memories", x=>x.eq("console_id",selectedConsoleId).order("created_at",{ascending:false})).then(d=>{memories=d;}),
    q("files", x=>x.eq("console_id",selectedConsoleId).order("created_at",{ascending:false})).then(d=>{filesListData=d;})
  ];
  const res = await Promise.allSettled(jobs);
  const bad = res.find(r=>r.status==='rejected');
  if (bad) say(`Part of the platform failed to load: ${bad.reason?.message||bad.reason}`,'err');
  try {
    if (apps.length) {
      const ids=apps.map(a=>a.id);
      [appRecords, appLinks, appViews] = await Promise.all([
        q("app_records", x=>x.in("app_id",ids).order("created_at",{ascending:true})),
        q("app_links", x=>x.in("app_id",ids)),
        q("app_views", x=>x.in("app_id",ids))
      ]);
    } else { appRecords=[]; appLinks=[]; appViews=[]; }
    if (connections.length) connGrants = await q("connection_grants", x=>x.in("connection_id",connections.map(c=>c.id))); else connGrants=[];
  } catch(e){ say(`App details failed to load: ${e.message}`,'err'); }
  if (!byId(apps,selectedAppId)) selectedAppId = apps[0]?.id || "";
  localStorage.setItem("consoleai_app_id", selectedAppId);
  await loadVerify();
  try { allDispatches = jackets.length ? await q("dispatches", x=>x.in("jacket_id", jackets.map(j=>j.id)).order("created_at",{ascending:true})) : []; } catch(e){ allDispatches=[]; }
  renderApps(); renderAppDetail(); renderApprovals(); renderCredits(); renderConnections(); renderAutomations(); renderMemories(); renderFiles(); renderBooks();
  if (selectedThreadId) { /* re-render app cards with fresh record counts */ try{ await loadMessages(); }catch{} }
}
const APP_TEMPLATES = {
  tracker:{name:"Invoice Tracker",kind:"tracker",fields:"Client, Amount, Due date",desc:"Money owed to us, kept current from the room’s work."},
  board:{name:"Hiring Pipeline",kind:"board",fields:"Candidate, Role, Source",desc:"One card per person, moving through the stages."},
  dashboard:{name:"Pipeline Dashboard",kind:"dashboard",fields:"Deal, Stage, Value",desc:"What the App counts, from its own records."},
  form_page:{name:"Floor Count Page",kind:"form_page",fields:"Item, Count, Location",desc:"A simple page of fields anyone in the room can submit from a phone."}
};
function renderApps(){
  const el=$("#appList"); if(!el) return;
  el.innerHTML = apps.length ? apps.map(a=>{
    const n=recordsOf(a.id).length;
    const links=appLinks.filter(l=>l.app_id===a.id).length;
    return `<div class="selectable ${a.id===selectedAppId?'active':''}" data-app="${a.id}"><div class="item-head"><b>${esc(a.name)}</b><span class="pill ${a.status==='published'?'green':'gold'}">${esc(a.status)}</span></div><div class="muted">${esc(a.kind)} · ${n} records · ${links} links · ${esc(a.visibility)}${a.home_room_id?' · home room':''}</div><div>${esc(excerpt(a.description,140))}</div></div>`;
  }).join("") : '<div class="empty">No Apps yet. Create one above, start from a template, or let an agent return one in a dispatch.</div>';
  el.querySelectorAll("[data-app]").forEach(x=>x.addEventListener("click",()=>{ selectedAppId=x.dataset.app; localStorage.setItem("consoleai_app_id",selectedAppId); const ap=byId(apps,selectedAppId); appViewKind = ap?.kind==="board" ? "board" : ap?.kind==="dashboard" ? "dashboard" : "table"; localStorage.setItem("consoleai_app_view",appViewKind); renderApps(); renderAppDetail(); }));
}
function recordRow(r, fields){
  const statusOpts=[...new Set(["open","doing","review","done","paid","overdue",r.status])].map(s=>`<option ${s===r.status?'selected':''}>${esc(s)}</option>`).join("");
  const vals=fields.map(f=>`<div class="kv">${esc(f.label)}: <b>${esc(String(r.values?.[f.key] ?? ""))}</b></div>`).join("");
  const extra=Object.entries(r.values||{}).filter(([k])=>!fields.some(f=>f.key===k)).map(([k,v])=>`<div class="kv">${esc(k)}: <b>${esc(String(v))}</b></div>`).join("");
  return `<div class="rec"><div class="item-head"><b>${esc(r.title)}</b><select data-record-status="${r.id}">${statusOpts}</select></div>${vals}${extra}<div class="muted">${new Date(r.created_at).toLocaleString()}${r.created_by_agent?" · by agent":""}</div><div class="row" style="margin-top:6px"><button class="small secondary" data-del-record="${r.id}" type="button">Delete record</button></div></div>`;
}
function renderAppDetail(){
  const el=$("#appDetail"); if(!el) return;
  const app=byId(apps,selectedAppId);
  if (!app) { el.innerHTML='<div class="empty">Select an App to see and edit its records.</div>'; return; }
  const fields=parseFields(app.fields);
  const recs=recordsOf(app.id);
  const links=appLinks.filter(l=>l.app_id===app.id);
  let body="";
  if (appViewKind==="board") {
    const stages=[...new Set([...(app.kind==="board"?["open","doing","review","done"]:[]), ...recs.map(r=>r.status)])];
    body=`<div class="boardcols">${stages.map(st=>`<div class="boardcol"><h5>${esc(st)} (${recs.filter(r=>r.status===st).length})</h5>${recs.filter(r=>r.status===st).map(r=>recordRow(r,fields)).join("")||'<div class="kv">Empty</div>'}</div>`).join("")}</div>`;
  } else if (appViewKind==="dashboard") {
    const byStatus={}; recs.forEach(r=>byStatus[r.status]=(byStatus[r.status]||0)+1);
    body=`<div class="proof" style="margin-top:6px">${Object.entries(byStatus).map(([k,v])=>`<div><b>${esc(k)}</b>${v} records</div>`).join("")||'<div><b>0</b>No records yet</div>'}</div>` + recs.map(r=>recordRow(r,fields)).join("");
  } else {
    body=recs.length?`<table class="rec-table"><thead><tr><th>Record</th>${fields.map(f=>`<th>${esc(f.label)}</th>`).join("")}<th>Status</th></tr></thead><tbody>${recs.map(r=>`<tr><td><b>${esc(r.title)}</b><br><button class="small secondary" data-del-record="${r.id}" type="button">Delete</button></td>${fields.map(f=>`<td>${esc(String(r.values?.[f.key] ?? ""))}</td>`).join("")}<td><select data-record-status="${r.id}">${[...new Set(["open","doing","review","done","paid","overdue",r.status])].map(s2=>`<option ${s2===r.status?'selected':''}>${esc(s2)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>`:'<div class="empty">No records yet — add the first one below.</div>';
  }
  const fieldInputs=fields.map(f=>`<label>${esc(f.label)}</label><input data-record-field="${esc(f.key)}" placeholder="${esc(f.label)}">`).join("");
  el.innerHTML=`<div class="item"><div class="item-head"><h4>${esc(app.name)}</h4><span class="pill ${app.status==='published'?'green':'gold'}">${esc(app.status)}</span></div>
  <div class="muted">/${esc(app.slug)} · ${esc(app.kind)} · ${recs.length} records · linked contexts: ${links.length}${app.published_at?` · published ${new Date(app.published_at).toLocaleString()}`:''}</div>
  <p>${esc(app.description||"")}</p>
  <div class="row"><button class="small secondary" data-view-kind="table" type="button">Table</button><button class="small secondary" data-view-kind="board" type="button">Board</button><button class="small secondary" data-view-kind="dashboard" type="button">Dashboard</button></div>
  ${body}
  <h3>${app.kind==="form_page"?"Submit an entry":"Add a record"}</h3>
  <label>Title</label><input id="recordTitle" placeholder="Record title">
  ${fieldInputs}
  <label>Status</label><input id="recordStatus" value="open">
  <div class="row" style="margin-top:10px"><button id="addRecordBtn" type="button">${app.kind==="form_page"?"Submit":"Add record"}</button></div>
  <div class="row" style="margin-top:12px"><button class="small secondary" id="postAppCardBtn" type="button">Post App card to thread</button><button class="small secondary" id="linkAppRoomBtn" type="button">Link to selected room</button><button class="small secondary" id="appThreadBtn" type="button">Open App thread</button><button class="small" id="publishAppBtn" type="button">${app.status==='published'?'Published':'Request publish approval'}</button></div>
  <p class="muted">Publishing routes through the Approvals inbox. Share link: <b>${esc(location.origin)}/app/${esc(app.slug)}</b> \u2014 drafts never render there, and the public page lights up once the owner sets the backend service secret (docs/BACKEND.md). Until then signed-in members use the App here.</p></div>`;
  el.querySelectorAll("[data-record-status]").forEach(sel=>sel.addEventListener("change",async()=>{ const {error}=await supabase.from("app_records").update({status:sel.value}).eq("id",sel.dataset.recordStatus); if(error)say(error.message,'err'); else await loadPlatform(); }));
  el.querySelectorAll("[data-del-record]").forEach(b=>b.addEventListener("click",async()=>{ const {error}=await supabase.from("app_records").delete().eq("id",b.dataset.delRecord); if(error)say(error.message,'err'); else await loadPlatform(); }));
  el.querySelectorAll("[data-view-kind]").forEach(b=>b.addEventListener("click",async()=>{ appViewKind=b.dataset.viewKind; localStorage.setItem("consoleai_app_view",appViewKind); await ensureAppView(app, appViewKind==="dashboard"?"table":appViewKind); renderAppDetail(); }));
  $("#addRecordBtn")?.addEventListener("click",async()=>{
    try{
      const title=$("#recordTitle").value.trim(); if(!title) throw new Error("Record needs a title.");
      const values={}; el.querySelectorAll("[data-record-field]").forEach(i=>{ if(i.value.trim()) values[i.dataset.recordField]=i.value.trim(); });
      const {error}=await supabase.from("app_records").insert({app_id:app.id,created_by:currentUser.id,title,status:($("#recordStatus").value.trim()||"open").slice(0,40),values});
      if(error) throw error;
      say(`Record added to ${app.name}. Every linked context now shows it.`,'ok'); await loadPlatform();
    }catch(e){ say(e.message,'err'); }
  });
  $("#postAppCardBtn")?.addEventListener("click",()=>postAppCard(app).catch(e=>say(e.message,'err')));
  $("#linkAppRoomBtn")?.addEventListener("click",async()=>{
    try{ if(!selectedRoomId) throw new Error("Select a room first.");
      const {error}=await supabase.from("app_links").insert({app_id:app.id,room_id:selectedRoomId,created_by:currentUser.id});
      if(error && !/duplicate|unique/i.test(error.message)) throw error;
      say(`${app.name} linked into the selected room. The same records now render there.`,'ok'); await loadPlatform();
    }catch(e){ say(e.message,'err'); }
  });
  $("#appThreadBtn")?.addEventListener("click",()=>openAppThread(app).catch(e=>say(e.message,'err')));
  $("#publishAppBtn")?.addEventListener("click",async()=>{
    if (app.status==='published') { say(`${app.name} is already published inside this console.`,'ok'); return; }
    try{
      const {error}=await supabase.from("approvals").insert({console_id:selectedConsoleId,app_id:app.id,requested_by:currentUser.id,kind:'publish',title:`Publish App: ${app.name}`,payload:{slug:app.slug}});
      if(error) throw error;
      say(`Publish approval requested for ${app.name}. Decide it in the Approvals tab; approving flips the App to published.`,'ok'); showInspector("approvals"); await loadPlatform();
    }catch(e){ say(e.message,'err'); }
  });
}
async function ensureAppView(app, kind){
  const name = kind==="board" ? "Board" : "Table";
  if (appViews.some(v=>v.app_id===app.id && v.name===name)) return;
  const {data,error}=await supabase.from("app_views").insert({app_id:app.id,created_by:currentUser.id,name,view_kind:kind}).select().single();
  if (!error && data) appViews.push(data);
}
async function postAppCard(app){
  if (!selectedThreadId) throw new Error("Select or create a thread first.");
  const recs=recordsOf(app.id);
  const body=`app:${app.id}\n${app.name} — ${recs.length} records · ${app.status}`;
  const {error}=await supabase.from("messages").insert({thread_id:selectedThreadId,author_profile_id:currentUser.id,kind:'app_card',body});
  if(error) throw error;
  await loadMessages(); say(`App card posted. It renders live records wherever this thread is read.`,'ok');
}
async function openAppThread(app){
  const roomId = app.home_room_id || selectedRoomId;
  if (!roomId) throw new Error("Select a room first (this App has no home room).");
  if (roomId!==selectedRoomId) { selectedRoomId=roomId; localStorage.setItem("consoleai_room_id",selectedRoomId); renderRooms(); await loadRoomContext(); }
  let t=threads.find(x=>x.anchor_type==='app' && x.anchor_id===app.id);
  if (!t) {
    const {data,error}=await supabase.from("threads").insert({room_id:roomId,created_by:currentUser.id,title:`App: ${app.name}`,anchor_type:'app',anchor_id:app.id}).select().single();
    if(error) throw error; t=data; threads.push(t);
    const l=await supabase.from("app_links").insert({app_id:app.id,thread_id:t.id,created_by:currentUser.id});
    if (l.error && !/duplicate|unique/i.test(l.error.message)) throw l.error;
  }
  selectedThreadId=t.id; localStorage.setItem("consoleai_thread_id",selectedThreadId); renderThreads(); await loadMessages(); say(`Anchored App thread open: ${t.title}`,'ok');
}
async function createAppFromPayload(rawApp, agent, jacket, dispatch){
  if (!rawApp || typeof rawApp!=="object" || !String(rawApp.name||"").trim()) return null;
  const fields=parseFields(rawApp.fields||[]);
  const payload={
    console_id:selectedConsoleId, home_room_id:jacket?.room_id||selectedRoomId||null,
    created_by:currentUser.id, created_by_agent:agent?.id||null, source_dispatch_id:dispatch?.id||null,
    name:String(rawApp.name).slice(0,120), slug:slugify(rawApp.slug||rawApp.name),
    kind:["tracker","board","dashboard","form_page","custom"].includes(rawApp.kind)?rawApp.kind:"custom",
    description:String(rawApp.description||"").slice(0,2000), fields, visibility:"room", status:"draft"
  };
  if (!payload.slug || payload.slug.length<2) return null;
  let app = apps.find(x=>x.slug===payload.slug);
  if (!app) {
    const {data,error}=await supabase.from("apps").insert(payload).select().single();
    if(error) throw error; app=data; apps.push(app);
    await ensureAppView(app, app.kind==="board"?"board":"table");
    if (payload.home_room_id) await supabase.from("app_links").insert({app_id:app.id,room_id:payload.home_room_id,created_by:currentUser.id});
  }
  const recs=Array.isArray(rawApp.records)?rawApp.records.slice(0,50):[];
  for (const r of recs) {
    if (!r || !String(r.title||"").trim()) continue;
    const {data,error}=await supabase.from("app_records").insert({app_id:app.id,created_by:currentUser.id,created_by_agent:agent?.id||null,source_dispatch_id:dispatch?.id||null,title:String(r.title).slice(0,200),status:String(r.status||"open").slice(0,40),values:(r.values&&typeof r.values==="object")?r.values:{}}).select().single();
    if (!error && data) appRecords.push(data);
  }
  selectedAppId=app.id; localStorage.setItem("consoleai_app_id",selectedAppId);
  return app;
}
async function chargeDispatch(dispatch){
  const est=Number(dispatch?.estimated_credits||0);
  if (!est || est<=0 || !credits.length) return;
  const {data,error}=await supabase.from("credit_ledger").insert({console_id:selectedConsoleId,created_by:currentUser.id,jacket_id:dispatch.jacket_id,dispatch_id:dispatch.id,entry_kind:'dispatch_charge',credits:-est,note:'Completed dispatch charge (test ledger)',idempotency_key:`dispatch:${dispatch.id}`}).select().single();
  if (!error && data) credits.unshift(data);
}

function metalFor(funded){ return funded>=10 ? "Gold" : funded>=3 ? "Silver" : funded>=1 ? "Bronze" : "Unranked"; }
function renderBooks(){
  const el=$("#booksList"); if(!el) return;
  if (!agents.length) { el.innerHTML='<div class="empty">No agents on this lot yet — books stay at zero until work runs.</div>'; return; }
  const fundedJacketIds=new Set(jackets.filter(j=>j.state==='funded').map(j=>j.id));
  const chargeByDispatch=new Map();
  credits.filter(c=>c.entry_kind==='dispatch_charge' && c.dispatch_id).forEach(c=>chargeByDispatch.set(c.dispatch_id,(chargeByDispatch.get(c.dispatch_id)||0)+Math.abs(c.credits||0)));
  el.innerHTML=agents.map(a=>{
    const mine=allDispatches.filter(d=>d.agent_id===a.id);
    const done=mine.filter(d=>d.status==='completed');
    const funded=new Set(done.map(d=>d.jacket_id).filter(id=>fundedJacketIds.has(id))).size;
    const charged=mine.reduce((sum,d)=>sum+(chargeByDispatch.get(d.id)||0),0);
    const rate=mine.length?Math.round(100*done.length/mine.length):0;
    return `<div class="item"><div class="item-head"><b>${esc(a.display_name)}</b><span class="pill ${funded>=3?'green':funded>=1?'gold':''}">${metalFor(funded)}</span></div><div class="muted">@${esc(a.slug)} · ${esc(a.status)}</div><div class="kv">Dispatches: <b>${mine.length}</b> · completed: <b>${done.length}</b> (${mine.length?rate+"%":"—"}) · funded jackets: <b>${funded}</b> · credits charged (test ledger): <b>${charged}</b></div></div>`;
  }).join("");
}
function renderVerify(){
  const sum=$("#verifySummary"); if(!sum) return;
  const j=byId(jackets,selectedJacketId);
  if (!j) { sum.className="empty"; sum.textContent="Select a jacket."; $("#stipsList").innerHTML=""; $("#checksList").innerHTML=""; return; }
  const reqChecks=checks.filter(c=>c.required), passChecks=reqChecks.filter(c=>c.status==='pass');
  const reqStips=stips.filter(x=>x.required), okStips=reqStips.filter(x=>x.satisfied);
  const ready=reqChecks.length>0 && passChecks.length===reqChecks.length && okStips.length===reqStips.length;
  sum.className="item";
  sum.innerHTML=`<b>${esc(j.title)}</b> · state <span class="pill gold">${esc(j.state)}</span><br>
  Required checks: ${passChecks.length}/${reqChecks.length} pass · Required stips: ${okStips.length}/${reqStips.length} satisfied<br>
  ${j.state==='funded'?'This jacket is funded. The database opened it only because the rule above held.': ready?'Ready: “Try move to funded” should be accepted by the database.':'Not fundable yet — the database will refuse, and its exact reason will be shown.'}`;
  $("#stipsList").innerHTML = stips.length ? stips.map(x=>`<div class="item"><div class="item-head"><b>${esc(x.label)}</b><span class="pill ${x.satisfied?'green':'gold'}">${x.satisfied?'satisfied':'owed'}${x.required?' · required':''}</span></div><div class="muted">${esc(x.detail||"")}${x.satisfied_at?` · ${new Date(x.satisfied_at).toLocaleString()}`:""}</div><div class="row"><button class="small secondary" data-toggle-stip="${x.id}" type="button">${x.satisfied?'Mark not satisfied':'Mark satisfied'}</button><button class="small secondary" data-del-stip="${x.id}" type="button">Delete</button></div></div>`).join("") : '<div class="empty">No stips on this jacket yet.</div>';
  $("#checksList").innerHTML = checks.length ? checks.map(c=>`<div class="item"><div class="item-head"><b>${esc(c.label)}</b><span class="pill ${c.status==='pass'?'green':c.status==='fail'?'red':'gold'}">${esc(c.status)}${c.required?' · required':''}</span></div><div class="muted">${esc(c.kind)}${c.checked_at?` · checked ${new Date(c.checked_at).toLocaleString()}`:""}</div><div class="row"><select data-check-status="${c.id}">${["pending","pass","fail","waived"].map(s2=>`<option ${s2===c.status?'selected':''}>${s2}</option>`).join("")}</select><button class="small secondary" data-del-check="${c.id}" type="button">Delete</button></div></div>`).join("") : '<div class="empty">No verification checks yet. Funded requires at least one required check.</div>';
  document.querySelectorAll("[data-toggle-stip]").forEach(b=>b.addEventListener("click",async()=>{ const x=byId(stips,b.dataset.toggleStip); const {error}=await supabase.from("stips").update({satisfied:!x.satisfied,satisfied_by:!x.satisfied?currentUser.id:null}).eq("id",x.id); if(error)say(error.message,'err'); else await loadVerify(); }));
  document.querySelectorAll("[data-del-stip]").forEach(b=>b.addEventListener("click",async()=>{ const {error}=await supabase.from("stips").delete().eq("id",b.dataset.delStip); if(error)say(error.message,'err'); else await loadVerify(); }));
  document.querySelectorAll("[data-check-status]").forEach(sel=>sel.addEventListener("change",async()=>{ const {error}=await supabase.from("verify_checks").update({status:sel.value,checked_by:sel.value==='pending'?null:currentUser.id}).eq("id",sel.dataset.checkStatus); if(error)say(error.message,'err'); else await loadVerify(); }));
  document.querySelectorAll("[data-del-check]").forEach(b=>b.addEventListener("click",async()=>{ const {error}=await supabase.from("verify_checks").delete().eq("id",b.dataset.delCheck); if(error)say(error.message,'err'); else await loadVerify(); }));
}
function renderApprovals(){
  const el=$("#approvalsList"); if(!el) return;
  el.innerHTML = approvals.length ? approvals.map(x=>`<div class="item"><div class="item-head"><b>${esc(x.title)}</b><span class="pill ${x.status==='approved'?'green':x.status==='rejected'?'red':'gold'}">${esc(x.status)}</span></div><div class="muted">${esc(x.kind)} · ${new Date(x.created_at).toLocaleString()}${x.decided_at?` · decided ${new Date(x.decided_at).toLocaleString()}`:""}</div>${x.status==='pending'?`<div class="row" style="margin-top:8px"><button class="small" data-approve="${x.id}" type="button">Approve</button><button class="small secondary" data-reject="${x.id}" type="button">Reject</button></div>`:''}</div>`).join("") : '<div class="empty">No approvals yet.</div>';
  el.querySelectorAll("[data-approve]").forEach(b=>b.addEventListener("click",()=>decideApproval(b.dataset.approve,true).catch(e=>say(e.message,'err'))));
  el.querySelectorAll("[data-reject]").forEach(b=>b.addEventListener("click",()=>decideApproval(b.dataset.reject,false).catch(e=>say(e.message,'err'))));
}
async function decideApproval(id, ok){
  const ap=byId(approvals,id); if(!ap) return;
  if (ap.expires_at && new Date(ap.expires_at) < new Date()) {
    await supabase.from("approvals").update({status:'expired',decided_by:currentUser.id,decided_at:new Date().toISOString()}).eq("id",id);
    say('That approval expired before a decision. Request it again against current inputs.','err'); await loadPlatform(); return;
  }
  const {error}=await supabase.from("approvals").update({status:ok?'approved':'rejected',decided_by:currentUser.id,decided_at:new Date().toISOString()}).eq("id",id);
  if(error) throw error;
  if (ok && ap.kind==='publish' && ap.app_id) {
    const r=await supabase.from("apps").update({status:'published'}).eq("id",ap.app_id);
    if(r.error) throw r.error;
    say('Approval recorded — App is now published inside this console.','ok');
  } else if (ok && ap.kind==='fund' && ap.jacket_id) {
    const r=await supabase.from("job_jackets").update({state:'funded'}).eq("id",ap.jacket_id);
    if(r.error) say(`Approved, but the database still refuses funded: ${r.error.message}`,'err'); else say('Approval recorded — jacket funded (every required check/stip held).','ok');
    await loadJackets(); renderJackets();
  } else {
    say(ok?`Approved: ${ap.title}. The approved action is now yours to perform; nothing was sent automatically.`:`Rejected: ${ap.title}.`,'ok');
  }
  await loadPlatform();
}
function renderCredits(){
  const balEl=$("#creditBalance"); if(!balEl) return;
  const bal=creditBalance();
  balEl.className= credits.length? "item":"empty";
  balEl.innerHTML= credits.length? `<b>${bal} credits</b> pooled balance (test ledger) · ${credits.length} entries${bal<=0?' · <span class="err">exhausted — dispatch pauses</span>':''}` : 'No credit ledger yet. Add a test grant to adopt credits for this console.';
  $("#creditsList").innerHTML=credits.slice(0,10).map(c=>`<div class="item"><div class="item-head"><b>${c.credits>0?'+':''}${c.credits} credits</b><span class="pill">${esc(c.entry_kind)}</span></div><div class="muted">${new Date(c.created_at).toLocaleString()} · ${esc(c.note||"")}</div></div>`).join("");
}
function renderConnections(){
  const el=$("#connectionsList"); if(!el) return;
  el.innerHTML = connections.length ? connections.map(c=>{
    const grants=connGrants.filter(g=>g.connection_id===c.id);
    const gtxt=grants.map(g=>{ const a=g.agent_id?byId(agents,g.agent_id):null; const r=g.room_id?byId(rooms,g.room_id):null; return `${esc(a?.display_name||('#'+(r?.name||'room')))} (${esc(g.access)})`; }).join(", ")||"no grants yet";
    return `<div class="item"><div class="item-head"><b>${esc(c.name)}</b><span class="pill ${c.status==='connected'?'green':'gold'}">${esc(c.status)}</span></div><div class="muted">${esc(c.kind)} · ref ${esc(c.auth_ref||'—')} · grants: ${gtxt}</div><div class="row"><button class="small secondary" data-grant-conn="${c.id}" type="button">Grant to selected agent</button><button class="small secondary" data-del-conn="${c.id}" type="button">Delete</button></div></div>`;
  }).join("") : '<div class="empty">No connections registered yet.</div>';
  el.querySelectorAll("[data-grant-conn]").forEach(b=>b.addEventListener("click",async()=>{ try{ const agentId=$("#grantAgent").value; if(!agentId) throw new Error("Register/select an agent first."); const {error}=await supabase.from("connection_grants").insert({connection_id:b.dataset.grantConn,agent_id:agentId,created_by:currentUser.id,access:'write'}); if(error && !/duplicate|unique/i.test(error.message)) throw error; say('Connection granted to that agent. Dispatch packets include granted connection names only — never secrets.','ok'); await loadPlatform(); }catch(e){ say(e.message,'err'); } }));
  el.querySelectorAll("[data-del-conn]").forEach(b=>b.addEventListener("click",async()=>{ const {error}=await supabase.from("connections").delete().eq("id",b.dataset.delConn); if(error)say(error.message,'err'); else await loadPlatform(); }));
}
function renderAutomations(){
  const el=$("#autosList"); if(!el) return;
  el.innerHTML = automations.length ? automations.map(x=>{ const a=x.agent_id?byId(agents,x.agent_id):null; return `<div class="item"><div class="item-head"><b>${esc(x.name)}</b><span class="pill ${x.status==='active'?'green':'gold'}">${esc(x.status)}</span></div><div class="muted">${esc(x.trigger_kind)}${x.schedule_cron?` · ${esc(x.schedule_cron)}`:""} · agent ${esc(a?.display_name||"—")} · fails ${x.fail_count}${x.last_run_at?` · last run ${new Date(x.last_run_at).toLocaleString()}`:""}</div><p>${esc(excerpt(x.instructions,180))}</p><div class="row"><button class="small" data-run-auto="${x.id}" type="button">Run now</button><button class="small secondary" data-toggle-auto="${x.id}" type="button">${x.status==='active'?'Pause':'Activate'}</button><button class="small secondary" data-del-auto="${x.id}" type="button">Delete</button></div></div>`; }).join("") : '<div class="empty">No automations yet.</div>';
  el.querySelectorAll("[data-run-auto]").forEach(b=>b.addEventListener("click",()=>runAutomation(b.dataset.runAuto).catch(e=>say(e.message,'err'))));
  el.querySelectorAll("[data-toggle-auto]").forEach(b=>b.addEventListener("click",async()=>{ const x=byId(automations,b.dataset.toggleAuto); const {error}=await supabase.from("automations").update({status:x.status==='active'?'paused':'active',fail_count:x.status==='active'?x.fail_count:0}).eq("id",x.id); if(error)say(error.message,'err'); else await loadPlatform(); }));
  el.querySelectorAll("[data-del-auto]").forEach(b=>b.addEventListener("click",async()=>{ const {error}=await supabase.from("automations").delete().eq("id",b.dataset.delAuto); if(error)say(error.message,'err'); else await loadPlatform(); }));
}
async function runAutomation(id){
  const x=byId(automations,id); if(!x) return;
  if (x.jacket_id && byId(jackets,x.jacket_id)) { selectedJacketId=x.jacket_id; localStorage.setItem("consoleai_jacket_id",selectedJacketId); renderJackets(); await loadDispatches(); await loadVerify(); }
  const agentId=x.agent_id || $("#dispatchAgent")?.value;
  showInspector("runs");
  const created=await createDispatch({agentId, instructions:x.instructions||x.name});
  const ran=byId(dispatches,created.id);
  const failed=ran && ran.status!=='completed';
  await supabase.from("automations").update({last_run_at:new Date().toISOString(), fail_count: failed ? (x.fail_count||0)+1 : 0}).eq("id",x.id);
  say(failed?`Automation ran and the dispatch ended ${ran.status}. Fail count updated; 3 fails auto-pauses it in the database.`:`Automation ran: dispatch completed.`, failed?'err':'ok');
  await loadPlatform();
}
function renderMemories(){
  const el=$("#memoriesList"); if(!el) return;
  const visible=memories.filter(m=>!m.expires_at || new Date(m.expires_at)>new Date());
  el.innerHTML = visible.length ? visible.map(m=>`<div class="item"><div class="item-head"><b>${esc(m.title)}</b><span class="pill">${esc(m.kind)} · ${esc(m.scope)}</span></div><p>${esc(m.body)}</p><div class="muted">${new Date(m.created_at).toLocaleString()}${m.review_on?` · review ${esc(m.review_on)}`:""}</div><div class="row"><button class="small secondary" data-del-mem="${m.id}" type="button">Delete</button></div></div>`).join("") : '<div class="empty">No memories yet. Save what the next human or agent must know.</div>';
  el.querySelectorAll("[data-del-mem]").forEach(b=>b.addEventListener("click",async()=>{ const {error}=await supabase.from("memories").delete().eq("id",b.dataset.delMem); if(error)say(error.message,'err'); else await loadPlatform(); }));
}
function renderFiles(){
  const el=$("#filesList"); if(!el) return;
  el.innerHTML = filesListData.length ? filesListData.map(f=>`<div class="item"><div class="item-head"><b>${esc(f.name)}</b><span class="pill">${esc(f.kind)}</span></div><div class="muted">${new Date(f.created_at).toLocaleString()}${f.size_bytes?` · ${Math.round(f.size_bytes/1024)} KB`:''}${f.mime_type?` · ${esc(f.mime_type)}`:''}</div>${f.external_url?`<p><a href="${esc(f.external_url)}" target="_blank" rel="noopener">Open linked file</a></p>`:''}<div class="row">${f.storage_path?`<button class="small secondary" data-signed-file="${f.id}" type="button">Download (signed link)</button>`:''}<button class="small secondary" data-del-file="${f.id}" type="button">Delete</button></div></div>`).join("") : '<div class="empty">No files yet. Upload one above.</div>';
  el.querySelectorAll("[data-signed-file]").forEach(b=>b.addEventListener("click",async()=>{ try{ const f=byId(filesListData,b.dataset.signedFile); const {data,error}=await supabase.storage.from("consoleai-files").createSignedUrl(f.storage_path,300); if(error) throw error; window.open(data.signedUrl,"_blank","noopener"); }catch(e){ say(e.message,'err'); } }));
  el.querySelectorAll("[data-del-file]").forEach(b=>b.addEventListener("click",async()=>{ const {error}=await supabase.from("files").delete().eq("id",b.dataset.delFile); if(error)say(error.message,'err'); else await loadPlatform(); }));
}

async function loadConsoles() {
  if (!currentUser) { $("#consoleList").innerHTML='<p class="muted">Sign in to load only the consoles your grants allow.</p>'; $("#workspaceShell").classList.add("hidden"); return; }
  const { data, error } = await supabase.from("consoles").select("id,name,slug,status,created_at,owner_id").order("created_at",{ascending:true});
  if (error) throw error;
  consoles = data || [];
  if (!byId(consoles,selectedConsoleId)) selectedConsoleId = consoles[0]?.id || "";
  localStorage.setItem("consoleai_console_id", selectedConsoleId);
  $("#consoleList").innerHTML = consoles.length ? consoles.map(c=>`<div class="selectable ${c.id===selectedConsoleId?'active':''}" data-console="${c.id}"><div class="item-head"><b>${esc(c.name)}</b><span class="pill">${esc(c.status)}</span></div><div class="muted">/${esc(c.slug)} · ${c.owner_id===currentUser.id?'owned by you':'member'}</div></div>`).join("") : '<div class="empty">No consoles yet. Create the first rooftop above.</div>';
  document.querySelectorAll("[data-console]").forEach(el=>el.addEventListener("click",async()=>{ selectedConsoleId=el.dataset.console; selectedRoomId=""; selectedJacketId=""; localStorage.setItem("consoleai_console_id",selectedConsoleId); await refreshAll(); }));
  await refreshWorkspace();
}

async function refreshWorkspace() {
  const c = byId(consoles,selectedConsoleId);
  $("#workspaceShell").classList.toggle("hidden", !c);
  if (!c) return;
  $("#workspaceTitle").textContent = c.name;
  $("#workspaceMeta").textContent = `/${c.slug} · ${c.status}`;
  await Promise.all([loadAgents(), loadRooms(), loadJackets()]);
  renderAgentOptions(); renderRooms(); renderJackets();
  await loadRoomContext();
  await loadDispatches();
  await loadPlatform();
}
async function refreshAll() { await loadConsoles(); }

async function loadAgents() {
  const { data, error } = await supabase.from("agents").select("*").eq("console_id",selectedConsoleId).order("created_at",{ascending:true});
  if (error) throw error; agents=data||[]; renderAgents(); renderAgentOptions();
}
function renderAgents() {
  $("#agentList").innerHTML = agents.length ? agents.map(a=>`<div class="item"><div class="item-head"><h4>${esc(a.display_name)}</h4><span class="pill ${a.status==='ready'?'green':a.status==='error'?'red':'gold'}">${esc(a.status)}</span></div><div class="muted">/${esc(a.slug)} · ${esc(a.kind)} · ${esc(a.brain_model||'brain not declared')}</div><p>${esc(a.specialty||'No specialty declared.')}</p><div class="row">${(a.capabilities||[]).map(x=>`<span class="pill">${esc(x)}</span>`).join("")}</div><p class="muted">${a.endpoint_url?`Endpoint: ${esc(a.endpoint_url)}`:'No endpoint — dispatches will safely halt.'}<br>Last probe: ${a.last_probe_at?`${a.last_probe_ok?'pass':'fail'} · ${esc(a.last_probe_detail||'')}`:'never'}</p><div class="row"><button class="small secondary" data-probe-agent="${a.id}" type="button">Capability probe</button><button class="small secondary" data-add-agent-room="${a.id}" type="button">Add to selected room</button></div></div>`).join("") : '<div class="empty">No agents on this lot yet.</div>';
  renderInspector(); applyShellSearch();
  document.querySelectorAll("[data-probe-agent]").forEach(b=>b.addEventListener("click",()=>probeAgent(b.dataset.probeAgent)));
  document.querySelectorAll("[data-add-agent-room]").forEach(b=>b.addEventListener("click",()=>addAgentToRoom(b.dataset.addAgentRoom)));
}
function renderAgentOptions() {
  const opts = agents.map(a=>`<option value="${a.id}">${esc(a.display_name)} · ${esc(a.slug)}</option>`).join("");
  $("#roomDefaultAgent").innerHTML = '<option value="">No default</option>'+opts;
  $("#dispatchAgent").innerHTML = opts || '<option value="">Register an agent first</option>';
  const aa=$("#autoAgent"); if (aa) aa.innerHTML = opts || '<option value="">Register an agent first</option>';
  const ga2=$("#grantAgent"); if (ga2) ga2.innerHTML = opts || '<option value="">Register an agent first</option>';
  document.querySelectorAll("[data-handoff-agent]").forEach(sel=>{ const cur=sel.value; sel.innerHTML=opts; if(cur) sel.value=cur; });
}

async function probeAgent(agentId) {
  const a=byId(agents,agentId); if(!a) return;
  const started=performance.now(); let ok=false,status=null,detail='';
  if (!a.endpoint_url) { detail='No endpoint configured; browser probe not run.'; }
  else {
    const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),8000);
    try { const r=await fetch(a.endpoint_url,{method:'GET',signal:ctrl.signal}); status=r.status; ok=r.ok; detail=`Browser GET returned HTTP ${r.status}. A non-2xx health route may still be reachable but is not marked ready.`; }
    catch(e) { detail=`Browser could not reach endpoint (${e.name}: ${e.message}). This may be offline, blocked, or CORS.`; }
    finally { clearTimeout(timer); }
  }
  const latency=Math.round(performance.now()-started);
  let r=await supabase.from("capability_probes").insert({agent_id:a.id,checked_by:currentUser.id,method:'browser_http',target_url:a.endpoint_url||'',ok,http_status:status,latency_ms:latency,detail});
  if (r.error) { say(r.error.message,'err'); return; }
  r=await supabase.from("agents").update({status:ok?'ready':'error',last_probe_at:new Date().toISOString(),last_probe_ok:ok,last_probe_detail:detail}).eq("id",a.id);
  if (r.error) { say(r.error.message,'err'); return; }
  await loadAgents(); say(`${a.display_name} probe recorded: ${ok?'READY':'NOT READY'} — ${detail}`, ok?'ok':'err');
}

async function loadRooms() {
  const { data, error } = await supabase.from("rooms").select("*").eq("console_id",selectedConsoleId).order("created_at",{ascending:true});
  if (error) throw error; rooms=data||[];
  if (!byId(rooms,selectedRoomId)) selectedRoomId = rooms[0]?.id || "";
  localStorage.setItem("consoleai_room_id",selectedRoomId);
}
function renderRooms() {
  $("#roomList").innerHTML = rooms.length ? rooms.map(r=>`<div class="selectable ${r.id===selectedRoomId?'active':''}" data-room="${r.id}"><div class="item-head"><b># ${esc(r.name)}</b><span class="pill">${esc(r.status)}</span></div><div class="muted">${esc(r.guidelines||'No guidelines yet.')}</div></div>`).join("") : '<div class="empty">No rooms yet.</div>';
  applyShellSearch(); renderInspector();
  document.querySelectorAll("[data-room]").forEach(el=>el.addEventListener("click",async()=>{selectedRoomId=el.dataset.room;selectedThreadId="";localStorage.setItem("consoleai_room_id",selectedRoomId);renderRooms();await loadRoomContext();}));
}
async function addAgentToRoom(agentId) {
  if (!selectedRoomId) { say('Select or create a room first.','err'); return; }
  const { error } = await supabase.from("room_members").insert({room_id:selectedRoomId,agent_id:agentId,role:'member'});
  if (error && !/duplicate|unique/i.test(error.message)) { say(error.message,'err'); return; }
  await loadRoomContext(); say('Agent added to the selected room.','ok');
}

async function loadRoomContext() {
  const room=byId(rooms,selectedRoomId);
  $("#roomTitle").textContent = room ? `# ${room.name}` : 'Conversation';
  if (!room) { roomMembers=[]; threads=[]; $("#roomMembers").innerHTML=''; $("#threadSelect").innerHTML=''; $("#messageList").innerHTML='<p class="muted">Select a room.</p>'; return; }
  const [rm, th] = await Promise.all([
    supabase.from("room_members").select("id,role,profile_id,agent_id").eq("room_id",room.id),
    supabase.from("threads").select("*").eq("room_id",room.id).order("created_at",{ascending:true})
  ]);
  if (rm.error) throw rm.error; if (th.error) throw th.error;
  roomMembers=rm.data||[]; threads=th.data||[];
  if (!byId(threads,selectedThreadId)) selectedThreadId=threads[0]?.id||'';
  localStorage.setItem("consoleai_thread_id",selectedThreadId);
  renderRoomMembers(); renderThreads(); await loadMessages();
}
function renderRoomMembers() {
  const names=roomMembers.map(m=>{
    if (m.agent_id) { const a=byId(agents,m.agent_id); return `${esc(a?.display_name||'Agent')} · agent/${esc(m.role)}`; }
    return `${m.profile_id===currentUser.id?'You':esc(m.profile_id.slice(0,8))} · human/${esc(m.role)}`;
  });
  $("#roomMembers").innerHTML = `<b style="color:#fff">Members</b><br>${names.join('<br>')||'No members loaded.'}`;
  renderInspector();
}
function renderThreads() {
  $("#threadSelect").innerHTML = threads.map(t=>`<option value="${t.id}" ${t.id===selectedThreadId?'selected':''}>${esc(t.title)} · ${esc(t.anchor_type)}</option>`).join('');
}
async function loadMessages() {
  if (!selectedThreadId) { $("#messageList").innerHTML='<p class="muted">No thread yet. Create “General” with New thread.</p>'; return; }
  const { data, error } = await supabase.from("messages").select("*").eq("thread_id",selectedThreadId).order("created_at",{ascending:true}).limit(200);
  if (error) throw error;
  $("#messageList").innerHTML = data.length ? data.map(renderMessage).join("") : '<p class="muted">No messages yet.</p>';
  document.querySelectorAll("[data-open-app]").forEach(b=>b.addEventListener("click",()=>{ selectedAppId=b.dataset.openApp; localStorage.setItem("consoleai_app_id",selectedAppId); showInspector("apps"); renderApps(); renderAppDetail(); }));
  $("#messageList").scrollTop=$("#messageList").scrollHeight;
}

async function loadJackets() {
  const { data, error } = await supabase.from("job_jackets").select("*").eq("console_id",selectedConsoleId).order("created_at",{ascending:false});
  if (error) throw error; jackets=data||[];
  if (!byId(jackets,selectedJacketId)) selectedJacketId=jackets[0]?.id||'';
  localStorage.setItem("consoleai_jacket_id",selectedJacketId);
}
function renderJackets() {
  $("#jacketList").innerHTML = jackets.length ? jackets.map(j=>`<div class="selectable ${j.id===selectedJacketId?'active':''}" data-jacket="${j.id}"><div class="item-head"><b>${esc(j.title)}</b><span class="pill gold">${esc(j.state)}</span></div><div class="muted">Budget cap ${j.budget_cap_credits} credits · ${esc(j.visibility)}${j.room_id?' · room anchored':''}</div><div>${esc(excerpt(j.brief,180))}</div><div class="row" style="margin-top:8px"><label style="margin:0">State</label><select data-jacket-state="${j.id}">${['intake','desked','offered','approved','dispatched','evidence_open','verifying','safely_halted','on_hold','handled_error','errored','cancelled'].map(s=>`<option ${s===j.state?'selected':''}>${s}</option>`).join('')}</select></div></div>`).join("") : '<div class="empty">No job jackets yet.</div>';
  renderInspector(); applyShellSearch();
  document.querySelectorAll("[data-jacket]").forEach(el=>el.addEventListener("click",async(e)=>{ if(e.target.tagName==='SELECT')return; selectedJacketId=el.dataset.jacket; localStorage.setItem("consoleai_jacket_id",selectedJacketId); renderJackets(); await loadDispatches(); await loadVerify(); }));
  document.querySelectorAll("[data-jacket-state]").forEach(sel=>sel.addEventListener("change",async()=>{ const {error}=await supabase.from("job_jackets").update({state:sel.value}).eq("id",sel.dataset.jacketState); if(error){say(error.message,'err');} else {await loadJackets();renderJackets();} }));
}

async function ensureJacketThread(jacket) {
  if (!jacket?.room_id) return null;
  let t = threads.find(x=>x.anchor_type==='jacket' && x.anchor_id===jacket.id);
  if (t) return t;
  const { data, error } = await supabase.from("threads").insert({room_id:jacket.room_id,created_by:currentUser.id,title:`Jacket: ${jacket.title}`,anchor_type:'jacket',anchor_id:jacket.id}).select().single();
  if (error) throw error;
  threads.push(data); renderThreads(); return data;
}

async function loadDispatches() {
  if (!selectedJacketId) { dispatches=[]; renderDispatches(); return; }
  const { data, error } = await supabase.from("dispatches").select("*").eq("jacket_id",selectedJacketId).order("created_at",{ascending:true});
  if (error) throw error; dispatches=data||[];
  stepsByDispatch=new Map();
  if (dispatches.length) {
    const r=await supabase.from("run_steps").select("*").in("dispatch_id",dispatches.map(d=>d.id)).order("sequence",{ascending:true});
    if (r.error) throw r.error;
    for (const s of r.data||[]) { if(!stepsByDispatch.has(s.dispatch_id)) stepsByDispatch.set(s.dispatch_id,[]); stepsByDispatch.get(s.dispatch_id).push(s); }
  }
  renderDispatches();
}
function renderDispatches() {
  const j=byId(jackets,selectedJacketId);
  if (!j) { $("#dispatchList").innerHTML='<div class="empty">Select a jacket.</div>'; return; }
  $("#dispatchList").innerHTML = dispatches.length ? dispatches.map(d=>{const a=byId(agents,d.agent_id);const steps=stepsByDispatch.get(d.id)||[];return `<div class="item"><div class="item-head"><h4>${esc(a?.display_name||'Agent')}</h4><span class="pill ${d.status==='completed'?'green':d.status==='errored'?'red':'gold'}">${esc(d.status)}</span></div><div class="muted">${esc(d.mode)} · est. ${d.estimated_credits} credits · ${new Date(d.created_at).toLocaleString()}</div><p>${esc(excerpt(d.instructions,240))}</p>${d.response_text?`<p><b>Output:</b> ${esc(excerpt(d.response_text,700))}</p>`:''}${d.error_text?`<p class="err">${esc(d.error_text)}</p>`:''}<div class="muted">${steps.map(s=>`#${s.sequence} ${esc(s.kind)} · ${esc(s.status)} · ${esc(s.summary)}`).join('<br>')}</div><div style="border-top:1px solid var(--line);margin-top:10px;padding-top:8px"><label>Hand off to</label><select data-handoff-agent="${d.id}"></select><label>Handoff note</label><input data-handoff-note="${d.id}" placeholder="Review the output and continue…"><div class="row" style="margin-top:8px"><button class="small secondary" data-handoff="${d.id}" type="button">Create + run handoff</button><button class="small secondary" data-rerun="${d.id}" type="button">Replay dispatch</button></div></div></div>`}).join("") : '<div class="empty">No dispatches on this jacket yet.</div>';
  renderAgentOptions();
  document.querySelectorAll("[data-handoff]").forEach(b=>b.addEventListener("click",()=>handoff(b.dataset.handoff)));
  document.querySelectorAll("[data-rerun]").forEach(b=>b.addEventListener("click",()=>rerun(b.dataset.rerun)));
}

async function addStep(dispatchId, sequence, kind, status, summary, output={}) {
  const { error } = await supabase.from("run_steps").insert({dispatch_id:dispatchId,sequence,kind,status,summary,output});
  if (error) throw error;
}
async function executeDispatch(dispatch) {
  // Real backend first: the Cloudflare Pages Function runs the dispatch
  // server-side with this session's JWT (no browser CORS, secrets stay off
  // the client). A static-only host (local dev) has no function, so only a
  // clearly-missing backend falls back to the legacy in-browser runner --
  // a structured backend error never double-runs the dispatch.
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      const r = await fetch("/api/dispatch", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ dispatch_id: dispatch.id }) });
      const text = await r.text();
      let j = null; try { j = JSON.parse(text); } catch { /* html/error pages handled below */ }
      const backendMissing = r.status === 404 || r.status === 501 || /^\s*</.test(text || "");
      if (!backendMissing) {
        await loadJackets(); renderJackets(); await loadDispatches(); await loadPlatform().catch(()=>{});
        if (j?.ok) {
          say(`Server runner finished: ${j.status}${j.app_id ? " \u00b7 an App was built in the room" : ""}. Verify evidence in the Verify tab before funded can open.`, j.status === "completed" ? "ok" : "err");
        } else {
          say(`Server runner refused this dispatch: ${j?.error || ("HTTP " + r.status)}`, "err");
        }
        return;
      }
    }
  } catch (e) {
    if (!/Failed to fetch|NetworkError/i.test(String(e?.message || e))) throw e;
  }
  await executeDispatchBrowser(dispatch);
}
async function executeDispatchBrowser(dispatch) {
  const jacket=byId(jackets,dispatch.jacket_id); const agent=byId(agents,dispatch.agent_id);
  const room = jacket?.room_id ? byId(rooms,jacket.room_id) : byId(rooms,selectedRoomId);
  const grantedConnections = connGrants.filter(g=>g.agent_id===agent?.id).map(g=>{ const c=byId(connections,g.connection_id); return c?{name:c.name,kind:c.kind,status:c.status,access:g.access,scopes:c.scopes}:null; }).filter(Boolean);
  const payload={event:'consoleai.dispatch.v1',dispatch_id:dispatch.id,parent_dispatch_id:dispatch.parent_dispatch_id,handoff_note:dispatch.handoff_note,mode:dispatch.mode,instructions:dispatch.instructions,
    jacket:jacket?{id:jacket.id,title:jacket.title,brief:jacket.brief,acceptance_criteria:jacket.acceptance_criteria,budget_cap_credits:jacket.budget_cap_credits}:null,
    agent:agent?{id:agent.id,slug:agent.slug,kind:agent.kind,brain_model:agent.brain_model,capabilities:agent.capabilities,instructions:agent.instructions}:null,
    room:room?{id:room.id,name:room.name,guidelines:room.guidelines}:null,
    memories:memories.filter(m=>m.scope==='console' || (room && m.room_id===room.id) || (agent && m.agent_id===agent.id)).slice(0,20).map(m=>({kind:m.kind,title:m.title,body:m.body})),
    apps:apps.filter(a=>!room || a.home_room_id===room.id || appLinks.some(l=>l.app_id===a.id && l.room_id===room.id)).map(a=>({id:a.id,name:a.name,slug:a.slug,kind:a.kind,status:a.status,records:recordsOf(a.id).length})),
    connections_granted:grantedConnections,
    response_contract:{output:"string — what happened, with evidence",app:"optional {name,kind:tracker|board|dashboard|form_page|custom,description,fields:[labels],records:[{title,status,values:{}}]} — return this to create/update a living App in the room instead of only answering text. Drafts only for external sends; a human approves publishing."}};
  await supabase.from("dispatches").update({status:'running',started_at:new Date().toISOString(),request_payload:payload,endpoint_snapshot:agent?.endpoint_url||null}).eq("id",dispatch.id);
  await addStep(dispatch.id,1,'dispatch','running',agent?.endpoint_url?'Sending work packet to agent endpoint.':'No endpoint configured.',{});
  await loadDispatches();
  if (!agent?.endpoint_url) {
    const msg='No endpoint configured. Work packet is safely halted; configure an endpoint or use an external runner, then replay.';
    await addStep(dispatch.id,2,'verify','safely_halted',msg,{});
    await supabase.from("dispatches").update({status:'safely_halted',finished_at:new Date().toISOString(),error_text:msg}).eq("id",dispatch.id);
    await loadDispatches(); say(msg,'err'); return;
  }
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),90000);
  try {
    const response=await fetch(agent.endpoint_url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:ctrl.signal});
    const raw=await response.text(); let parsed=null; try{parsed=JSON.parse(raw)}catch{}
    const outputText=String(parsed?.output ?? parsed?.result ?? parsed?.text ?? parsed?.message ?? raw ?? '').slice(0,12000);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0,400)}`);
    await addStep(dispatch.id,2,'agent_response','completed','Agent endpoint returned a response.',{http_status:response.status,output:outputText.slice(0,2000)});
    await supabase.from("dispatches").update({status:'completed',finished_at:new Date().toISOString(),response_payload:parsed||{text:raw.slice(0,8000)},response_text:outputText,error_text:''}).eq("id",dispatch.id);
    if (jacket) {
      await supabase.from("job_jackets").update({state:'evidence_open'}).eq("id",jacket.id);
      const t=await ensureJacketThread(jacket);
      if (t && jacket.room_id && roomMembers.some(m=>m.agent_id===agent.id)) {
        await supabase.from("messages").insert({thread_id:t.id,author_profile_id:currentUser.id,author_agent_id:agent.id,kind:'agent_output',body:outputText.slice(0,12000)||'(empty agent response)'});
        if (jacket.room_id===selectedRoomId) { selectedThreadId=t.id; renderThreads(); await loadMessages(); }
      }
    }
    let createdApp=null;
    try {
      const rawApp = parsed?.app || (Array.isArray(parsed?.apps)?parsed.apps[0]:null);
      if (rawApp) {
        createdApp = await createAppFromPayload(rawApp, agent, jacket, dispatch);
        if (createdApp) {
          await addStep(dispatch.id,3,'app_create','completed',`Agent returned an App: ${createdApp.name} (${recordsOf(createdApp.id).length} records).`,{app_id:createdApp.id});
          const t2 = jacket ? await ensureJacketThread(jacket) : null;
          const threadForCard = t2?.id || selectedThreadId;
          if (threadForCard) {
            const asAgent = jacket?.room_id && roomMembers.some(m=>m.agent_id===agent.id);
            await supabase.from("messages").insert({thread_id:threadForCard,author_profile_id:currentUser.id,author_agent_id:asAgent?agent.id:null,kind:'app_card',body:`app:${createdApp.id}\n${createdApp.name} — ${recordsOf(createdApp.id).length} records · ${createdApp.status}`});
          }
        }
      }
    } catch(appErr) {
      try{ await addStep(dispatch.id,3,'app_create','errored',`App payload rejected: ${appErr.message}`,{}); }catch{}
    }
    try{ await chargeDispatch(dispatch); }catch{}
    await loadJackets(); renderJackets(); await loadDispatches(); await loadPlatform();
    say(`Dispatch completed by ${agent.display_name}.${createdApp?` It built the “${createdApp.name}” App in the room.`:""} Evidence is recorded. Verify it in the Verify tab; funded stays blocked until every required check/stip passes.`,'ok');
  } catch(e) {
    const msg=`Endpoint failed (${e.name}: ${e.message}). It may be offline or blocked by CORS.`;
    await addStep(dispatch.id,2,'agent_response','errored',msg,{});
    await supabase.from("dispatches").update({status:'errored',finished_at:new Date().toISOString(),error_text:msg}).eq("id",dispatch.id);
    await loadDispatches(); say(msg,'err');
  } finally { clearTimeout(timer); }
}
async function createDispatch({agentId,instructions,parentId=null,handoffNote=''}) {
  const jacket=byId(jackets,selectedJacketId); const agent=byId(agents,agentId);
  if (!jacket) throw new Error('Select a jacket first.');
  if (!agent) throw new Error('Register and select an agent first.');
  if (jacket.room_id && !roomMembers.some(m=>m.agent_id===agent.id)) throw new Error(`${agent.display_name} is not in this jacket's room yet. Add it on the Agent Lot.`);
  const est=parseInt($("#dispatchCredits").value||'0',10);
  if (jacket.budget_cap_credits>0 && est>jacket.budget_cap_credits) throw new Error('Estimated credits exceed the jacket budget cap.');
  if (credits.length && creditBalance()<=0) throw new Error('Credit balance is exhausted for this console. Work is paused until credits are replenished (Platform tab).');
  if (!String(instructions||"").trim()) throw new Error('Write the dispatch instructions first.');
  const { data, error } = await supabase.from("dispatches").insert({jacket_id:jacket.id,agent_id:agent.id,parent_dispatch_id:parentId,dispatched_by:currentUser.id,mode:$("#dispatchMode").value,instructions,handoff_note:handoffNote,estimated_credits:est,endpoint_snapshot:agent.endpoint_url||null,status:'queued'}).select().single();
  if (error) throw error;
  await executeDispatch(data); return data;
}
async function handoff(parentId) {
  const parent=byId(dispatches,parentId); if(!parent)return;
  const agentId=document.querySelector(`[data-handoff-agent="${parentId}"]`)?.value;
  const note=document.querySelector(`[data-handoff-note="${parentId}"]`)?.value.trim()||'Continue from the previous output.';
  const instructions=`Handoff from a previous agent. Note: ${note}\n\nOriginal instructions:\n${parent.instructions}\n\nPrevious output:\n${parent.response_text||'(no output)'}\n\nContinue, review, or complete the next step. Return evidence.`;
  try { await createDispatch({agentId,instructions,parentId,handoffNote:note}); } catch(e){ say(e.message,'err'); }
}
async function rerun(id) { const d=byId(dispatches,id); if(!d)return; const {data,error}=await supabase.from("dispatches").insert({jacket_id:d.jacket_id,agent_id:d.agent_id,dispatched_by:currentUser.id,mode:d.mode,instructions:d.instructions,estimated_credits:d.estimated_credits,status:'queued'}).select().single(); if(error){say(error.message,'err');return;} await executeDispatch(data); }

async function refreshSession() {
  const { data, error } = await supabase.auth.getSession(); if (error) throw error;
  currentUser=data.session?.user||null;
  $("#signedOut").classList.toggle("hidden",!!currentUser); $("#signedIn").classList.toggle("hidden",!currentUser); $("#consoleTools").classList.toggle("hidden",!currentUser);
  if (currentUser) {
    $("#userEmail").textContent=currentUser.email||currentUser.id; $("#userId").textContent=currentUser.id;
    await loadProfile(); await loadConsoles(); startRealtime();
    say('Connected. Consoles, agents, rooms, jackets and runs below are filtered by Postgres RLS.','ok');
  } else {
    $("#workspaceShell").classList.add("hidden"); say('Backend reachable. Signed out — request a magic link to enter.');
  }
}
function startRealtime() {
  if (realtimeChannel) return;
  realtimeChannel=supabase.channel('consoleai-workspace')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},async()=>{await loadMessages();})
    .on('postgres_changes',{event:'*',schema:'public',table:'dispatches'},async()=>{await loadDispatches();})
    .on('postgres_changes',{event:'*',schema:'public',table:'job_jackets'},async()=>{await loadJackets();renderJackets();})
    .on('postgres_changes',{event:'*',schema:'public',table:'apps'},async()=>{await loadPlatform();})
    .on('postgres_changes',{event:'*',schema:'public',table:'app_records'},async()=>{await loadPlatform();})
    .on('postgres_changes',{event:'*',schema:'public',table:'verify_checks'},async()=>{await loadVerify();})
    .on('postgres_changes',{event:'*',schema:'public',table:'stips'},async()=>{await loadVerify();})
    .on('postgres_changes',{event:'*',schema:'public',table:'approvals'},async()=>{await loadPlatform();})
    .on('postgres_changes',{event:'*',schema:'public',table:'credit_ledger'},async()=>{await loadPlatform();})
    .subscribe();
}
async function init() {
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) { say('Missing Supabase publishable configuration.','err'); return; }
  supabase=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  try { await refreshSession(); } catch(e){ say(`Connection failed: ${e.message}`,'err'); }
  supabase.auth.onAuthStateChange(async()=>{ try{await refreshSession();}catch(e){say(e.message,'err');} });
}

$("#magicBtn").addEventListener("click",async(ev)=>{const b=ev.currentTarget;b.disabled=true;try{const email=$("#email").value.trim();if(!email.includes('@'))throw new Error('Enter a valid email.');const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.href}});if(error)throw error;say('Sign-in link sent. Open it on this device; this page will finish signing you in.','ok');}catch(e){say(e.message,'err');}finally{b.disabled=false;}});
$("#saveProfileBtn").addEventListener("click",async()=>{try{await ensureProfile();say('Passport profile saved.','ok');}catch(e){say(e.message,'err');}});
$("#signOutBtn").addEventListener("click",async()=>{await supabase.auth.signOut();});
$("#consoleName").addEventListener("input",()=>{if(!$("#consoleSlug").dataset.touched)$("#consoleSlug").value=slugify($("#consoleName").value);});
$("#consoleSlug").addEventListener("input",e=>{e.target.dataset.touched='1';e.target.value=slugify(e.target.value);});
$("#createConsoleBtn").addEventListener("click",async(ev)=>{const b=ev.currentTarget;b.disabled=true;try{await ensureProfile();const name=$("#consoleName").value.trim();const slug=slugify($("#consoleSlug").value||name);if(!name||slug.length<2)throw new Error('Console needs a name and a slug of at least 2 characters.');const {data,error}=await supabase.from("consoles").insert({name,slug,owner_id:currentUser.id}).select().single();if(error)throw error;selectedConsoleId=data.id;$("#consoleName").value='';$("#consoleSlug").value='';delete $("#consoleSlug").dataset.touched;await loadConsoles();say(`Console created: ${name}. Owner membership came from the database trigger.`,'ok');}catch(e){say(e.message,'err');}finally{b.disabled=false;}});
$("#addConsoleMemberBtn").addEventListener("click",async()=>{try{const id=$("#memberProfileId").value.trim();if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Paste a full passport UUID.');const {error}=await supabase.from("memberships").insert({console_id:selectedConsoleId,profile_id:id,role:'member'});if(error)throw error;$("#memberProfileId").value='';say('Human added to this console. They will see it after signing in.','ok');}catch(e){say(e.message,'err');}});
$("#refreshConsolesBtn").addEventListener("click",async()=>{await loadConsoles();});

$("#agentName").addEventListener("input",()=>{if(!$("#agentSlug").dataset.touched)$("#agentSlug").value=slugify($("#agentName").value);});
$("#agentSlug").addEventListener("input",e=>{e.target.dataset.touched='1';e.target.value=slugify(e.target.value);});
$("#registerAgentBtn").addEventListener("click",async(ev)=>{const b=ev.currentTarget;b.disabled=true;try{await ensureProfile();const payload={console_id:selectedConsoleId,created_by:currentUser.id,display_name:$("#agentName").value.trim(),slug:slugify($("#agentSlug").value||$("#agentName").value),kind:$("#agentKind").value,visibility:$("#agentVisibility").value,brain_model:$("#agentModel").value.trim(),specialty:$("#agentSpecialty").value.trim(),capabilities:parseCaps($("#agentCapabilities").value),endpoint_url:$("#agentEndpoint").value.trim()||null,instructions:$("#agentInstructions").value.trim(),status:'draft'};if(!payload.display_name||payload.slug.length<2)throw new Error('Agent needs a name and slug.');const {error}=await supabase.from("agents").insert(payload);if(error)throw error;await loadAgents();say(`Agent passport registered: ${payload.display_name}. Run its capability probe next.`,'ok');}catch(e){say(e.message,'err');}finally{b.disabled=false;}});

$("#roomName").addEventListener("input",()=>{if(!$("#roomSlug").dataset.touched)$("#roomSlug").value=slugify($("#roomName").value);});
$("#roomSlug").addEventListener("input",e=>{e.target.dataset.touched='1';e.target.value=slugify(e.target.value);});
$("#createRoomBtn").addEventListener("click",async(ev)=>{const b=ev.currentTarget;b.disabled=true;try{await ensureProfile();const payload={console_id:selectedConsoleId,created_by:currentUser.id,name:$("#roomName").value.trim(),slug:slugify($("#roomSlug").value||$("#roomName").value),guidelines:$("#roomGuidelines").value.trim(),default_agent_id:$("#roomDefaultAgent").value||null};if(!payload.name||payload.slug.length<2)throw new Error('Room needs a name and slug.');const {data,error}=await supabase.from("rooms").insert(payload).select().single();if(error)throw error;selectedRoomId=data.id;const t=await supabase.from("threads").insert({room_id:data.id,created_by:currentUser.id,title:'General',anchor_type:'general'}).select().single();if(t.error)throw t.error;if(payload.default_agent_id){const m=await supabase.from("room_members").insert({room_id:data.id,agent_id:payload.default_agent_id,role:'member'});if(m.error)throw m.error;}await loadRooms();renderRooms();await loadRoomContext();say(`Room opened: #${payload.name}. You are its owner; the general thread is ready.`,'ok');}catch(e){say(e.message,'err');}finally{b.disabled=false;}});
$("#threadSelect").addEventListener("change",async e=>{selectedThreadId=e.target.value;localStorage.setItem("consoleai_thread_id",selectedThreadId);await loadMessages();});
$("#newThreadBtn").addEventListener("click",async()=>{try{if(!selectedRoomId)throw new Error('Select a room first.');const title=prompt('Thread title','Working thread');if(!title)return;const {data,error}=await supabase.from("threads").insert({room_id:selectedRoomId,created_by:currentUser.id,title:title.slice(0,120),anchor_type:'general'}).select().single();if(error)throw error;selectedThreadId=data.id;await loadRoomContext();}catch(e){say(e.message,'err');}});
$("#sendMessageBtn").addEventListener("click",async()=>{try{if(!selectedThreadId)throw new Error('Create/select a thread first.');const body=$("#messageBody").value.trim();if(!body)throw new Error('Write a message first.');const {error}=await supabase.from("messages").insert({thread_id:selectedThreadId,author_profile_id:currentUser.id,body});if(error)throw error;$("#messageBody").value='';await loadMessages();}catch(e){say(e.message,'err');}});

$("#createJacketBtn").addEventListener("click",async(ev)=>{const b=ev.currentTarget;b.disabled=true;try{await ensureProfile();const payload={console_id:selectedConsoleId,room_id:selectedRoomId||null,created_by:currentUser.id,title:$("#jacketTitle").value.trim(),brief:$("#jacketBrief").value.trim(),acceptance_criteria:$("#jacketAcceptance").value.trim(),budget_cap_credits:parseInt($("#jacketBudget").value||'0',10),visibility:$("#jacketVisibility").value,state:'intake'};if(!payload.title)throw new Error('Jacket needs a title.');const {data,error}=await supabase.from("job_jackets").insert(payload).select().single();if(error)throw error;selectedJacketId=data.id;await ensureJacketThread(data);await loadJackets();renderJackets();await loadDispatches();say(`Job jacket opened: ${payload.title}. Add its evidence stip + verification check in the Verify tab.`,'ok');}catch(e){say(e.message,'err');}finally{b.disabled=false;}});
$("#dispatchBtn").addEventListener("click",async(ev)=>{const b=ev.currentTarget;b.disabled=true;try{await createDispatch({agentId:$("#dispatchAgent").value,instructions:$("#dispatchInstructions").value.trim()});}catch(e){say(e.message,'err');}finally{b.disabled=false;}});
$("#refreshWorkBtn").addEventListener("click",async()=>{await loadRoomContext();await loadJackets();renderJackets();await loadDispatches();});

document.querySelectorAll("[data-insp]").forEach(b=>b.addEventListener("click",()=>showInspector(b.dataset.insp)));
$("#shellSearch")?.addEventListener("input",applyShellSearch);
$("#messageBody")?.addEventListener("input",renderMention);
$("#dispatchMentionBtn")?.addEventListener("click",async(ev)=>{
  const b=ev.currentTarget; b.disabled=true;
  try {
    const a=mentionAgent();
    const raw=String($("#messageBody").value||"").trim();
    if (!a) throw new Error("Type @agent-slug in the composer first, using a registered agent slug.");
    if (!raw) throw new Error("Write the work in the composer first.");
    showInspector("runs");
    await createDispatch({agentId:a.id, instructions:raw});
    $("#messageBody").value=""; renderMention();
  } catch(e) { say(e.message,'err'); }
  finally { b.disabled=false; }
});

$("#appName")?.addEventListener("input",()=>{ if(!$("#appSlug").dataset.touched) $("#appSlug").value=slugify($("#appName").value); });
$("#appSlug")?.addEventListener("input",e=>{ e.target.dataset.touched='1'; e.target.value=slugify(e.target.value); });
document.querySelectorAll("[data-template]").forEach(b=>b.addEventListener("click",()=>{
  const t=APP_TEMPLATES[b.dataset.template]; if(!t) return;
  $("#appName").value=t.name; $("#appSlug").value=slugify(t.name); delete $("#appSlug").dataset.touched;
  $("#appKind").value=t.kind; $("#appFields").value=t.fields; $("#appDesc").value=t.desc;
  $("#appCreateBox").open=true; showInspector("apps");
  say(`Template loaded: ${t.name}. Nothing is created or seeded yet — review, then click Create App. Your records stay your own data.`,'ok');
}));
$("#createAppBtn")?.addEventListener("click",async(ev)=>{
  const b=ev.currentTarget; b.disabled=true;
  try{
    await ensureProfile();
    if(!selectedRoomId) throw new Error("Select a room first — Apps are born inside a room.");
    const payload={console_id:selectedConsoleId,home_room_id:selectedRoomId,created_by:currentUser.id,name:$("#appName").value.trim(),slug:slugify($("#appSlug").value||$("#appName").value),kind:$("#appKind").value,visibility:$("#appVisibility").value,description:$("#appDesc").value.trim(),fields:parseFields($("#appFields").value),status:'draft'};
    if(!payload.name||payload.slug.length<2) throw new Error("App needs a name and slug.");
    const {data,error}=await supabase.from("apps").insert(payload).select().single(); if(error) throw error;
    selectedAppId=data.id; localStorage.setItem("consoleai_app_id",selectedAppId);
    await supabase.from("app_links").insert({app_id:data.id,room_id:selectedRoomId,created_by:currentUser.id});
    await ensureAppView(data, data.kind==="board"?"board":"table");
    say(`App created (draft): ${data.name}. Add records — editing here updates every linked room/thread.`,'ok');
    await loadPlatform();
  }catch(e){ say(e.message,'err'); } finally{ b.disabled=false; }
});
$("#seedVerifyBtn")?.addEventListener("click",async()=>{
  try{
    const j=byId(jackets,selectedJacketId); if(!j) throw new Error("Select a jacket first.");
    if (!stips.some(x=>x.required)) { const r=await supabase.from("stips").insert({jacket_id:j.id,created_by:currentUser.id,label:'Evidence attached for this jacket',required:true}); if(r.error) throw r.error; }
    if (!checks.some(x=>x.required)) { const r=await supabase.from("verify_checks").insert({jacket_id:j.id,created_by:currentUser.id,kind:'acceptance',label:'Evidence reviewed against the acceptance criteria',required:true}); if(r.error) throw r.error; }
    say('Standard required stip + check are on the jacket. Mark them only when the evidence is real.','ok'); await loadVerify();
  }catch(e){ say(e.message,'err'); }
});
$("#addStipBtn")?.addEventListener("click",async()=>{
  try{ const j=byId(jackets,selectedJacketId); if(!j) throw new Error("Select a jacket first.");
    const label=$("#stipLabel").value.trim(); if(!label) throw new Error("Write the stip first.");
    const {error}=await supabase.from("stips").insert({jacket_id:j.id,created_by:currentUser.id,label,required:true}); if(error) throw error;
    $("#stipLabel").value=""; await loadVerify();
  }catch(e){ say(e.message,'err'); }
});
$("#addCheckBtn")?.addEventListener("click",async()=>{
  try{ const j=byId(jackets,selectedJacketId); if(!j) throw new Error("Select a jacket first.");
    const label=$("#checkLabel").value.trim(); if(!label) throw new Error("Write the check first.");
    const {error}=await supabase.from("verify_checks").insert({jacket_id:j.id,created_by:currentUser.id,kind:$("#checkKind").value,label,required:true}); if(error) throw error;
    $("#checkLabel").value=""; await loadVerify();
  }catch(e){ say(e.message,'err'); }
});
$("#tryFundedBtn")?.addEventListener("click",async()=>{
  try{ const j=byId(jackets,selectedJacketId); if(!j) throw new Error("Select a jacket first.");
    const {error}=await supabase.from("job_jackets").update({state:'funded'}).eq("id",j.id);
    if(error) throw error;
    say(`FUNDED: ${j.title}. The database accepted it because every required check passes and every required stip is satisfied.`,'ok');
    await loadJackets(); renderJackets(); await loadVerify();
  }catch(e){ say(`Database refused funded (this is the system working): ${e.message}`,'err'); }
});
$("#requestApprovalBtn")?.addEventListener("click",async()=>{
  try{
    const kind=$("#approvalKind").value;
    const title=$("#approvalTitle").value.trim() || (kind==='publish'?'Publish the selected App':kind==='fund'?'Fund the selected jacket':'Approval requested');
    const payload={console_id:selectedConsoleId,requested_by:currentUser.id,kind,title,
      jacket_id:selectedJacketId||null, app_id:(kind==='publish'?selectedAppId:null)||null, payload:{note:'Requested from the Approvals inbox. Draft only — approving a send does not send anything by itself.'}};
    if (kind==='publish' && !payload.app_id) throw new Error("Select an App first (Apps tab).");
    const {error}=await supabase.from("approvals").insert(payload); if(error) throw error;
    $("#approvalTitle").value=""; say('Approval requested. It sits pending until a human decides — nothing external was sent.','ok'); await loadPlatform();
  }catch(e){ say(e.message,'err'); }
});
$("#addCreditBtn")?.addEventListener("click",async()=>{
  try{ const amt=parseInt($("#creditAmount").value||"0",10); if(!amt||amt<=0) throw new Error("Enter a positive test grant.");
    const {error}=await supabase.from("credit_ledger").insert({console_id:selectedConsoleId,created_by:currentUser.id,entry_kind:'grant',credits:amt,note:$("#creditNote").value.trim()||'Test grant (not a Stripe purchase)',idempotency_key:`manual:${currentUser.id}:${Date.now()}`}); if(error) throw error;
    say(`Test grant recorded: +${amt} credits. This is a ledger entry only — no card was charged.`,'ok'); await loadPlatform();
  }catch(e){ say(e.message,'err'); }
});
$("#addConnBtn")?.addEventListener("click",async()=>{
  try{ const name=$("#connName").value.trim(); if(!name) throw new Error("Name the connection first.");
    const ref=$("#connRef").value.trim();
    if (/(sk-|ghp_|xox[bap]-|AKIA|-----BEGIN)/.test(ref)) throw new Error("That looks like a raw secret. Store a vault reference only — never the secret itself.");
    const {error}=await supabase.from("connections").insert({console_id:selectedConsoleId,created_by:currentUser.id,name,kind:$("#connKind").value,status:$("#connStatus").value,auth_ref:ref}); if(error) throw error;
    $("#connName").value=""; $("#connRef").value=""; say(`Connection registered: ${name}. Grant it to agents below. OAuth into the real account is not performed here.`,'ok'); await loadPlatform();
  }catch(e){ say(e.message,'err'); }
});
$("#createAutoBtn")?.addEventListener("click",async()=>{
  try{ const name=$("#autoName").value.trim(); if(!name) throw new Error("Name the automation first.");
    const app=byId(apps,selectedAppId);
    const {error}=await supabase.from("automations").insert({console_id:selectedConsoleId,room_id:selectedRoomId||null,app_id:app?.id||null,jacket_id:selectedJacketId||null,agent_id:$("#autoAgent").value||null,created_by:currentUser.id,name,trigger_kind:$("#autoTrigger").value,schedule_cron:$("#autoCron").value.trim(),instructions:$("#autoInstructions").value.trim(),status:'draft'}); if(error) throw error;
    say(`Automation saved as a draft: ${name}. “Run now” performs a real dispatch; schedules are recorded until a background runner exists.`,'ok'); await loadPlatform();
  }catch(e){ say(e.message,'err'); }
});
$("#addMemBtn")?.addEventListener("click",async()=>{
  try{ const title=$("#memTitle").value.trim(); if(!title) throw new Error("Give the memory a title.");
    const {error}=await supabase.from("memories").insert({console_id:selectedConsoleId,room_id:selectedRoomId||null,created_by:currentUser.id,kind:$("#memKind").value,scope:selectedRoomId?'room':'console',title,body:$("#memBody").value.trim()}); if(error) throw error;
    $("#memTitle").value=""; $("#memBody").value=""; say('Memory saved. It rides along in future dispatch work packets for this room/console.','ok'); await loadPlatform();
  }catch(e){ say(e.message,'err'); }
});
$("#addFileBtn")?.addEventListener("click",async(ev)=>{
  const b=ev.currentTarget; b.disabled=true;
  try{
    const upload=$("#fileUpload")?.files?.[0]||null;
    const name=($("#fileName").value.trim() || (upload?upload.name:""));
    const url=$("#fileUrl").value.trim();
    if(!name) throw new Error("Name the file (or pick an upload) first.");
    if(url && !/^https:\/\//i.test(url)) throw new Error("File link must be an https URL.");
    let storage_path=""; let size_bytes=null; let mime_type="";
    if (upload) {
      if (upload.size>10485760) throw new Error("Upload is over the 10MB bucket limit.");
      const safe=upload.name.replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,80)||"file";
      storage_path=`${selectedConsoleId}/${Date.now()}-${safe}`;
      const up=await supabase.storage.from("consoleai-files").upload(storage_path,upload,{contentType:upload.type||"application/octet-stream",upsert:false});
      if(up.error) throw up.error;
      size_bytes=upload.size; mime_type=upload.type||"";
    }
    const {error}=await supabase.from("files").insert({console_id:selectedConsoleId,room_id:selectedRoomId||null,jacket_id:selectedJacketId||null,app_id:selectedAppId||null,created_by:currentUser.id,name,external_url:url||null,storage_path,mime_type,size_bytes,kind:$("#fileKind").value}); if(error) throw error;
    $("#fileName").value=""; $("#fileUrl").value=""; if($("#fileUpload")) $("#fileUpload").value="";
    say(upload?'File uploaded to private console storage and attached as evidence.':'File link attached as evidence metadata.','ok'); await loadPlatform();
  }catch(e){ say(e.message,'err'); } finally{ b.disabled=false; }
});
$("#refreshWorkBtn")?.addEventListener("click",async()=>{ await loadPlatform(); });

init();
