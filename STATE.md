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
