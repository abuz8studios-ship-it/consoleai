# ConsoleAI — Kylon-Class Parity + ABUZ8 Superfeatures

Saved from CHO order, 2026-10-16: "it should look identical to Kylon, but with our
other extra super features from the other 9 you reversed. Save, and handoff."

Implementation meaning inside ABUZ8: match Kylon's **functional anatomy and room-first
interaction model** at parity, with ABUZ8-owned name, copy, visuals, code and data.
Do not copy Kylon branding, artwork, text, proprietary UI assets or source code.
The test is behavioral: a Kylon user should understand our workspace immediately,
while our dealer-center machinery is visibly deeper.

## 1. The Kylon anatomy to match

### Shell
- Workspace switcher and account/passport control.
- Left rail: search; rooms/channels; direct rooms; agents; job jackets; apps;
  automations; connections; settings.
- Center: room timeline with human and agent members in one stream.
- Threads are anchored discussions, not a second unrelated inbox.
- Bottom composer supports @person and @agent mentions, files, and an explicit target.
- Right inspector changes with selection: App, Job Jacket, Files, Members, Runs, Verify.
- A built App appears as a living card inside the conversation and as a full record view
  in the inspector. The same record can be linked into many rooms/folders/chats.
- Publish action is visible on the App card/header. Draft work never silently goes live.

### Kylon moves that must work
1. A person asks in plain language inside a room.
2. The router selects the default/best agent or the explicitly mentioned agent.
3. The agent works with room instructions, scoped memory, files and granted connections.
4. The agent creates/updates real records and an in-chat App instead of only answering text.
5. People can inspect/edit those records without leaving the room.
6. A follow-up can turn the work into a scheduled/webhook/record-triggered automation.
7. External sends and publishing stop as drafts/approval cards.
8. Agent-to-agent handoff preserves the thread brief, records and evidence.
9. BYO agents join as members; a new agent starts private with only its creator/admins.
10. Credits pause work when exhausted; usage is attributable by room/agent/person/automation.

## 2. Our superfeatures on top

| Layer | Source learned | ConsoleAI addition |
|---|---|---|
| Run ledger | Zapier | Five-status taxonomy, step input/output, autoreplay, held-not-lost jobs, published rate card |
| Grants | Supabase | RLS in Postgres for people and agents; tokens resolved server-side, never shown to models |
| Pipeline | HubSpot | Stage-required proof fields block movement; time-in-stage; one timeline per jacket/client |
| Communication | Slack | Bot-user identity, App Home/control desk, one approvals inbox, external shared rooms later |
| Memory/docs | Notion | Record-pages, table/board/calendar views, expiring verification, Instructions→Skills→Custom Agents |
| Lot operations | DealerCenter | Intake scan, recon queue, service bay, desking across all agents, BHPH-style retainers |
| Settlement | DealerTrack | Canonical job packet, capability matrix (can-bid vs can-settle), live evidence checklist, funded state |
| Commercial shell | Frazer | One public fully-loaded flat tier, free maintained forms, human support promise with honest hours |
| Market brain | vAuto | Agent/job Metals, Market Job Supply, Cost-to-Market gate, Price-to-Market ladder, GROI, comp confidence |
| Sovereign runtime | ABUZ8 | Spectre/Pegasus fleet, local models and Hermes seats; cloud is a door, not a prison |

## 3. Data deltas beyond CP3

Current live tables already provide identity, consoles, memberships, agent passports,
capability probes, rooms/members, threads/messages, job jackets, dispatches and run steps.
The parity build adds, in order:

1. `apps` — room/console apps with visibility, status draft/published, schema definition.
2. `app_records` — typed JSON values with field schema, creator actor, source dispatch.
3. `app_links` — the same App/record linked into multiple rooms/folders/chats.
4. `app_views` — table/board/calendar/gallery renderers over one record source.
5. `files` + `file_versions` — room-scoped evidence and generated outputs.
6. `memories` — typed preference/feedback/reference/context with scope and review date.
7. `connections` + `connection_grants` — vault references only; never raw secrets in app rows.
8. `automations` — time/webhook/record triggers, budgets, 3-fail pause, skip overlaps.
9. `approvals` + `drafts` — one approval, one action, expiring if inputs change.
10. `stips` + `verify_checks` — the Verify & Fund desk; `funded` opens only when all required checks pass.
11. `credit_ledger` + `invoices` — one pooled, idempotent money unit; failed verification costs $0.
12. `agent_books`, `job_market_snapshots`, `offers` — book values, metals and capability-network offers.

## 4. Interaction parity checklist (acceptance, in order)

- [ ] Room-first shell replaces the CP3 card/form layout.
- [ ] @mention routes a message to the named agent; unnamed messages use room default/router.
- [ ] Agent run streams steps into the same thread; human can interrupt/approve.
- [ ] Agent creates an App with at least one record; card renders inline and in inspector.
- [ ] Editing a record in one linked context updates every linked context.
- [ ] Follow-up converts the App/workflow into a scheduled automation after approval.
- [ ] Handoff passes jacket + thread brief + records to a second agent.
- [ ] Invite a second human; private agent remains invisible until explicitly shared.
- [ ] Publish flow produces a shareable App URL under our domain.
- [ ] Jacket cannot reach funded until required stips/checks pass.
- [ ] Every run exposes cost estimate, actual run steps, output and evidence.

## 5. Build sequence from the current working floor

- **CP3.5 Parity shell:** left room rail, center timeline, right inspector, mention composer,
  agent identity chips, anchored App/Jacket cards. Existing tables only; visual proof required.
- **CP4 Verify & Fund:** stips/checks/approvals; remove the temporary database funding block
  only by replacing it with the real all-required-checks invariant.
- **CP4.5 Room Apps:** `apps/app_records/app_links/app_views`, inline card renderer, one-page form,
  draft→publish state, first invoice/hiring/warehouse examples built from our own data.
- **CP5 Credits:** one pooled ledger, rate card, run explorer/replay, Stripe test-mode purchase.
- **CP6 Books:** funded outcomes update Book Values, metals, CTM/GROI and stale-inventory board.
- **CP7 Connections/automations:** first real connectors, managed credentials, BYO-agent adapters,
  record/time/webhook triggers and circuit breakers.
- **CP8 Network:** cross-console offers, can-bid vs can-settle, marketplace take only on funded work.
- **CP9 OasisAI door:** same passport, registry, memory and ledger recognized by OasisAI.

## 6. Honest state at save time

- Done: CP1 identity/RLS; CP2 agent registry/probes; CP3 rooms/members/threads/messages/
  jackets/webhook dispatch/handoffs/run steps — schema/UI proven; advisors clean.
- Not done: room-first Kylon-class shell, inline record Apps, connected real endpoint in the UI,
  integrations catalog, agent cloud computers/Live Desktop, credits/billing, mobile apps.
- Local proof: `http://127.0.0.1:8000` while the dev server runs; render at `docs/cp23-render.png`.
- Public door target: `oasis.abuz8ai.com` (CHO proposed; DNS/deployment not yet done).
