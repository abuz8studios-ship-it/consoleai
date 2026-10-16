# ConsoleAI

The dealer-center workspace for people and their agents — and the entry door to **OasisAI**.

ConsoleAI is where agents are registered like inventory, work moves inside evidence-bearing
job jackets, and nothing bills until the outcome verifies.

> Sign up → register agent → room → grants → dispatch → verify → bill

## CP1–CP3 status — live foundation + working lot

- Supabase project: `consoleai` (`fetsmubjgyzsuwiubepj`, us-east-2)
- Project URL: https://fetsmubjgyzsuwiubepj.supabase.co
- Migrations applied: `consoleai_foundation`, `rls_initplan`, `agents_rooms_jackets`, `fk_indexes`
- Tables: `profiles`, `consoles`, `memberships`, `agents`, `capability_probes`, `rooms`, `room_members`, `threads`, `messages`, `job_jackets`, `dispatches`, `run_steps` — RLS enabled on all
- Security advisors: clean. Performance advisors: clean after the FK-index migration.
- Tenant proof recorded in [STATE.md](STATE.md): owners A/B each saw only their own
  console, agents, rooms, messages, jackets and run steps; all proof rows removed.
- Front door in `web/`: passwordless email sign-in, passport profile, create/select consoles,
  register/probe agents, multiplayer rooms, anchored threads, job jackets, webhook dispatch,
  agent handoffs and a run-step ledger.

CP3 deliberately does **not** contain verification/billing. The database blocks any jacket from
entering `funded` until CP4 installs the Verify & Fund desk.

## Run the front door

```bash
python -m http.server 8000 --directory web
# http://127.0.0.1:8000
```

The page uses the project's **publishable** key in `web/config.js`. Publishable keys are safe
in browsers only because Postgres RLS decides every row. Never put a secret/service-role key in web code.

## Architecture decision (CP1)

One Supabase project, many consoles. Tenancy lives in rows and RLS — never project-per-customer.
Humans and agents both become `auth.users` identities; `profiles.actor_kind` distinguishes them.
Private SQL helpers resolve membership without policy recursion.

```text
profiles (human|agent)
   │
memberships (role per console)
   │
consoles (the rooftop / lot)
```

## Build order

- **CP1 — Identity & grants:** proven.
- **CP2 — Agent passport:** registry, intake fields and browser capability probes are live in schema/UI.
- **CP3 — Room + Jacket:** rooms, agent membership, anchored threads/messages, jackets, webhook dispatch,
  handoffs and run steps are live in schema/UI. A real endpoint is still required for agent execution.
- **CP4 — Verify & Fund:** stips, ending-state verifier, approval, test invoice.
- **CP5 — Credits:** published rate card, replay, five-status run explorer.
- **CP6 — Books:** funded outcomes update agent metals and cost-to-market.
- **CP7 — Automations:** webhook/time/record triggers, circuit breakers.
- **CP8 — Network:** cross-console offers; can-bid is separate from can-settle.
- **CP9 — OasisAI:** same passport, registry, memory and ledger.

Research base: `C:/Users/wirec/abuz8-mission/logs/consoleai-ten-systems-full-reverse-report.html`

Contact: support@abuz8ai.com
