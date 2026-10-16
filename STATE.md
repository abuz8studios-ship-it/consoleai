# ConsoleAI state

Updated: 2026-10-16

## CP1 — Identity & grants: PROVEN

- Supabase project `consoleai` created in org `abuz8studios-ship-it's Org`
  (`ulnsumhkteeyvnftscok`), ref `fetsmubjgyzsuwiubepj`, region us-east-2.
- Quoted project cost returned by Supabase: **$0/month**. CHO said GO / will pay;
  confirmation ID was used only because this MCP client requires it.
- Project read-back: `ACTIVE_HEALTHY`, database Postgres 17.11.0.003.
- Migrations applied remotely:
  - `consoleai_foundation`
  - `rls_initplan`
- Public schema: `profiles`, `consoles`, `memberships`; RLS enabled on all.
- Advisors after migration 2: security 0 lints, performance 0 lints.
- Isolation proof (temporary synthetic principals, then cleanup):
  - Owner A saw only `cp1-alpha-proof` and 1 profile.
  - Owner B saw only `cp1-beta-proof` and 1 profile.
  - Final counts after cleanup: consoles 0, profiles 0.
  - Verdict returned by SQL: `CP1_RLS_PROOF_PASS`.
- Front door: `web/index.html` + `web/config.js` (publishable key only).

## CP2 + CP3 — Agent lot, rooms, jackets and dispatch: SCHEMA/UI PROVEN

- Migration `agents_rooms_jackets` applied remotely, followed by `fk_indexes`.
- Public schema now has 12 RLS-enabled tables; security and performance advisors both
  returned zero lints after the index migration.
- Extended two-tenant proof: temporary principals created an agent, room, thread,
  message, job jacket, dispatch and run step. Owner A saw exactly one of each;
  owner B saw only B's agent and zero A rooms/jackets. B's cross-tenant dispatch
  insert was blocked. A's attempt to move the jacket directly to `funded` was also
  blocked by the CP4-reserve trigger. All proof rows were cleaned in child-first order.
  SQL verdict: `CP2_CP3_RLS_PROOF_PASS`.
- Front door now includes agent registration/probes, room membership for humans and
  agents, threads/messages, job jackets, webhook dispatch/replay/handoffs and run steps.
- Dispatch honesty: without an endpoint it records `safely_halted`; endpoint failures
  record `errored`; only an HTTP success can record `completed`. First real signed-in
  user journey still needs CHO to open the local page and use the email magic link.

## CP3.5 slice 1 — Room-first shell: DOM + SIGNED-OUT PROVEN, SIGNED-IN UNPROVEN

- `web/index.html` workspace is now a 3-pane shell (existing 12 tables only):
  left rail (lot search filter, Rooms, Agents, Job Jackets; create forms in
  collapsibles), center room pane (room header/members, anchored thread picker,
  message timeline, `@agent-slug` composer with live target line and an explicit
  "Dispatch @mention on selected jacket" action), right inspector with
  Jacket / Runs / Members / Apps tabs. Runs tab holds the proven dispatch desk.
- Every CP2/CP3 element ID and JS function was preserved (no duplicate/missing
  IDs); dispatch honesty is unchanged (no endpoint → `safely_halted`).
  `@mention` sets the dispatch agent and says plainly whether that agent is a
  room member; it never pretends a message alone dispatched work.
- Apps tab is an honest empty state: `apps`/`app_records` (CP4.5) do not exist
  yet. Funding remains blocked until CP4.
- Fresh proof (2026-10-16 evening): inline JS `node --check` PASS; local HTTP
  200 (53,659 B); headless-Chrome DOM = "Backend reachable. Signed out — request
  a magic link to enter." (init + all listeners resolved); shell markers present
  in DOM; signed-out screenshot clean (`docs/cp35-slice1-render.png`,
  sha256 `1f5ccaa9caa24ebfa06046d0bf382e8cbc4f78a35162a11fffe5b5d57d84b336`).
- NOT proven yet: a signed-in browser journey through the new shell (needs CHO's
  magic link), a real agent endpoint run from the UI, inline App records,
  Kylon parity. The parity checklist in `docs/KYLON-PARITY-SPEC.md` stays unchecked.

## Online build — CP4 Verify & Fund + CP4.5 Room Apps + platform: DB PROVEN, UI DEPLOYED ONLINE

Built 2026-10-16 evening at CHO order ("you don't need the home server — build online").
Functional-parity discipline kept: ABUZ8-original name, copy, visuals, code and data;
nothing copied from Kylon's branding, text, assets or source.

- **Online front door (new, separate from abuz8ai.com):** Cloudflare Pages project
  `consoleai-abuz8` → https://consoleai-abuz8.pages.dev (HTTP 200, headless DOM
  "Backend reachable. Signed out"). **`oasis.abuz8ai.com` is LIVE** (verified
  2026-10-16 evening): Pages domain status `active` (verification + validation
  active, Google cert), HTTPS curl 200, headless DOM on the subdomain itself =
  "Backend reachable. Signed out", screenshot `docs/cp45-online-render.png`.
- Migrations applied remotely: `room_apps`, `verify_fund_platform`, `fk_indexes2`,
  `cascade_trigger_fix`. Public schema is now **25 RLS tables**: the CP1–CP3 twelve plus
  apps/app_records/app_links/app_views, stips/verify_checks/approvals, credit_ledger,
  connections/connection_grants, automations, memories, files. Security advisors: 0 lints.
  Performance: FK-covering indexes added; "unused index" INFOs remain on empty tables.
- **Funding invariant is real now:** `funded` opens only with ≥1 required check, every
  required check `pass`, and every required stip satisfied (replaces the CP4-reserve block).
- **Proof:** `supabase/tests/cp45_proof.sql` executed live → `CP4_CP45_RLS_PROOF_PASS`,
  cleanup 0 rows. It proved: funded blocked → blocked on stip → opens when satisfied;
  A sees own apps/records/credits/approvals, B sees 0 of A's; cross-console app links and
  connection grants rejected by triggers; automation 3-fail breaker pauses; credit
  idempotency rejects duplicates (balance 95). The proof first caught a real cascade
  validator bug (fixed in `cascade_trigger_fix`) and uses child-first cleanup like CP2+CP3.
- UI (`web/index.html`, single file): real Apps (templates for tracker/board/dashboard/
  form page with **no seeded fake data**, fields, table/board/dashboard views, record
  add/move/delete, link to rooms, anchored App threads, inline App cards in the timeline,
  publish-through-approval), Verify tab (stips/checks + "Try move to funded" showing the
  database's exact refusal), Approvals inbox (publish/fund actions execute on approval),
  Platform tab (test credit ledger with pause-at-zero + charge-on-completed-dispatch,
  connection registry + per-agent grants with secret-pattern refusal, automations with
  real Run-now dispatch, memories riding in work packets, file evidence links).
- **Agent → App contract:** every dispatch sends `consoleai.dispatch.v1` with room
  guidelines, scoped memories, room Apps and granted connection *names only*. An endpoint
  may return `{output, app:{name,kind,fields,records[]}}`; the UI then creates/updates
  that App + records and posts a living App card to the jacket thread.
- Honest limits still open: no signed-in browser journey recorded yet (0 real users/rows),
  no real agent endpoint has returned an App from the UI, Stripe charging is NOT wired
  (test ledger only), no background scheduler/webhook runner, no OAuth connection flows
  (registry + grants only), no public anonymous App pages, no file-upload storage,
  derived Agent Books + metals live in the Platform tab (real rows only; market pricing open), no marketplace (CP8), no mobile/desktop apps, console
  hard-delete still needs child-first ordering. Supabase Auth redirect allowlist may
  need the online URLs added in the dashboard for magic links.

## Not built yet — do not claim

- A connected real agent endpoint used from the browser (Hermes/Pegasus wiring is separate)
- Signed-in end-user journey proof (schema/RLS/UI deployed; first real sign-in still owed)
- Stripe funding/purchases (credit ledger is test-grant only today)
- Background automation runner (schedule/webhook/record triggers are recorded definitions; Run-now dispatch is real)
- OAuth/one-click connections into external services (registry + grants only)
- Public anonymous App pages and file-upload storage
- Market book pricing / Cost-to-Market from real market comps (derived Books + metals from own rows are live)
- Cross-console marketplace (CP8)
- OasisAI beyond shared identity direction (CP9)
- Pegasus GPU command. At CP1 save time Pegasus was online on Tailscale with SSH
  port open, but Amanecer's key returned Permission denied as user `wirec`.

## Live URLs

- Supabase API: https://fetsmubjgyzsuwiubepj.supabase.co
- Supabase dashboard project: https://supabase.com/dashboard/project/fetsmubjgyzsuwiubepj
- Local front door while developing: http://127.0.0.1:8000
- Online front door: https://consoleai-abuz8.pages.dev (Cloudflare Pages project `consoleai-abuz8`)
- Future public door: https://oasis.abuz8ai.com (DNS + Pages domain attached 2026-10-16; call it live only after a fresh HTTPS curl)
