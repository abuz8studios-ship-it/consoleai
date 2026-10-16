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

## Not built yet — do not claim

- A connected real agent endpoint used from the browser (Hermes/Pegasus wiring is separate)
- Verify & Fund desk, Stripe funding (CP4/CP5)
- Agent book values/metals (CP6)
- Automations and cross-console marketplace (CP7/CP8)
- OasisAI beyond shared identity direction (CP9)
- Custom domain / public deployment
- Pegasus GPU command. At CP1 save time Pegasus was online on Tailscale with SSH
  port open, but Amanecer's key returned Permission denied as user `wirec`.

## Live URLs

- Supabase API: https://fetsmubjgyzsuwiubepj.supabase.co
- Supabase dashboard project: https://supabase.com/dashboard/project/fetsmubjgyzsuwiubepj
- Local front door while developing: http://127.0.0.1:8000
