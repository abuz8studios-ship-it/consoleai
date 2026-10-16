# ConsoleAI

The dealer-center workspace for people and their agents — and the entry door to **OasisAI**.

ConsoleAI is where agents are registered like inventory, work moves inside evidence-bearing
job jackets, and nothing bills until the outcome verifies.

> Sign up → register agent → room → grants → dispatch → verify → bill

## Status — CP1–CP4.5 online, Kylon-class parity in progress (ABUZ8-original)

ConsoleAI learns the *functional anatomy* of a room-first company harness and fuses it
with dealer-center machinery. It is **not** a copy of any company's branding, copy,
assets, or source code; name, words, visuals, code and data here are ABUZ8's own.

- **Online:** https://oasis.abuz8ai.com (LIVE — Pages domain active, HTTPS verified
  2026-10-16) · mirror https://consoleai-abuz8.pages.dev
- Supabase project: `consoleai` (`fetsmubjgyzsuwiubepj`, us-east-2) — https://fetsmubjgyzsuwiubepj.supabase.co
- Migrations applied: `consoleai_foundation`, `rls_initplan`, `agents_rooms_jackets`, `fk_indexes`,
  `room_apps`, `verify_fund_platform`, `fk_indexes2`, `cascade_trigger_fix`
- **25 tables, RLS on all:** identity/lot/rooms/jackets/dispatch plus
  `apps`, `app_records`, `app_links`, `app_views`, `stips`, `verify_checks`, `approvals`,
  `credit_ledger`, `connections`, `connection_grants`, `automations`, `memories`, `files`.
  Security advisors: 0 lints.
- Proofs recorded in [STATE.md](STATE.md), including `CP4_CP45_RLS_PROOF_PASS`
  (`supabase/tests/cp45_proof.sql`): two-tenant isolation, funded-opens-only-when-verified,
  cross-tenant trigger blocks, 3-fail automation breaker, credit idempotency — cleaned to 0 rows.
- Front door in `web/`: passwordless email sign-in, rooms with people + agents as members,
  `@agent-slug` dispatch with handoffs and a run-step ledger, living in-room Apps
  (tracker/board/dashboard/form-page records, inline App cards, publish via approval),
  Verify & Fund desk, approvals inbox, pooled test credit ledger, connection grants,
  automations (real Run-now; schedules recorded for a future runner), memories, file evidence.

Still deliberately **not** wired: Stripe charging (test ledger only) and OAuth connection
flows. The background scheduler, agent callback and public App pages are built and deployed
but answer 503 until the owner sets their secrets (docs/BACKEND.md). Market pricing and
marketplace remain open. File upload storage is live (private `consoleai-files` bucket).
No silent OK gets paid: the database opens `funded` only when every required check passes
and every required stip is satisfied.

### Agent endpoint contract (`consoleai.dispatch.v1`)

Dispatch POSTs a work packet (instructions, jacket, room guidelines, scoped memories,
room Apps, granted connection *names only* — never secrets). Return JSON:

```json
{
  "output": "string — what happened, with evidence",
  "app": {
    "name": "Invoice Tracker", "kind": "tracker",
    "description": "optional", "fields": ["Client", "Amount", "Due date"],
    "records": [{ "title": "First invoice", "status": "open", "values": { "client": "Example" } }]
  }
}
```

With `app`, the UI creates/updates that living App in the room and posts its card to the
jacket thread. Without an endpoint, dispatch records `safely_halted` — never a pretend completion.

## Run the front door

```bash
# full stack (frontend + backend Functions) — recommended
npx wrangler pages dev

# static only (dispatch falls back to the in-browser runner)
python -m http.server 8000 --directory web
# http://127.0.0.1:8000
```

Frontend: `web/index.html` + `web/styles.css` + `web/app.js`. Backend:
Cloudflare Pages Functions in `functions/` (server dispatch runner, agent
callback, automation runner endpoint, published App pages) plus the
`runner/` cron Worker. Architecture, owner secrets and paid-hosting steps:
[docs/BACKEND.md](docs/BACKEND.md). Live posture: `GET /api/health`.

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
- **CP2 — Agent passport:** registry, intake fields and browser capability probes live.
- **CP3/CP3.5 — Rooms + jackets + room-first shell:** live; webhook dispatch, handoffs, run steps.
- **CP4 — Verify & Fund:** live in DB + UI (stips, checks, approvals; funded invariant proven by SQL).
- **CP4.5 — Room Apps:** live in DB + UI (records/views/links, inline cards, publish via approval).
- **CP5 — Credits:** pooled append-only *test* ledger live (pause at zero, charge completed only).
  Stripe purchase + published rate card still open.
- **CP6 — Books (derived):** per-agent dispatches/completed/funded/charged + metals (Gold ≥10 funded, Silver ≥3, Bronze ≥1) computed live from real rows. Market comps/Cost-to-Market need real market data. *(market layer open)*
- **CP7 — Connections/automations:** registry, grants, definitions, breaker and Run-now live.
  OAuth flows + background schedule/webhook runner still open.
- **CP8 — Network:** cross-console offers; can-bid is separate from can-settle. *(open)*
- **CP9 — OasisAI:** same passport, registry, memory and ledger. *(direction only)*

Research base: `C:/Users/wirec/abuz8-mission/logs/consoleai-ten-systems-full-reverse-report.html`
Parity target: [docs/KYLON-PARITY-SPEC.md](docs/KYLON-PARITY-SPEC.md) — the Kylon-class room/App shell
plus the nine learned superfeatures this repo must grow into next.

Contact: support@abuz8ai.com
