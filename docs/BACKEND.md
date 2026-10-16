# ConsoleAI real backend — architecture, secrets, and paid hosting

ConsoleAI is now a real full-stack app, hosted online. This document is the
operator map: what runs where, what only the account owner can switch on, and
how to connect unlimited agents of your own.

```
Browser (oasis.abuz8ai.com)
  web/index.html + web/styles.css + web/app.js + web/config.js (publishable key only)
        │  Supabase JS (auth + RLS rows)          │  POST /api/dispatch (session JWT)
        ▼                                         ▼
Supabase (Postgres 25 RLS tables + Storage)   Cloudflare Pages Functions (functions/)
  profiles/consoles/agents/rooms/jackets        GET  /api/health
  apps/records/stips/checks/approvals            POST /api/dispatch        → agent endpoint (server-side fetch, 55s)
  credits/connections/automations/memories      POST /api/agent-callback  ← long agents POST results here
  files + consoleai-files bucket                 POST /api/run-due         ← cron Worker every 5 min
                                                  GET  /app/:slug           → published App page
Cloudflare Worker consoleai-runner (runner/) — cron */5 * * * *
Your agents (Hermes, Claude Code, Codex, custom webhooks) — anywhere reachable by HTTPS
```

## Auth model (why the backend cannot leak tenants)

- **User dispatch** (`/api/dispatch`) runs with the *caller's* Supabase JWT.
  Every read/write goes through PostgREST as that user, so Postgres RLS still
  decides every row — the Function has no power the user doesn't.
- **Service paths** (`/api/agent-callback`, `/api/run-due`, `/app/:slug`) need
  the Supabase **service-role key**, which bypasses RLS. They therefore refuse
  with `503` until the owner sets the secrets below, and each is additionally
  gated by its own shared token. Verify the live posture any time at
  `GET https://oasis.abuz8ai.com/api/health` (boolean flags only — never values).

## Owner-only secrets (paste these yourself; never share them in chat)

| Secret | Where to get it | Where to put it | Unlocks |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → project `consoleai` → Project Settings → API → service_role key | Cloudflare dashboard → Workers & Pages → `consoleai-abuz8` → Settings → Variables and Secrets → add **Secret** for Production (and Preview if wanted) | agent callback, automation runner, public App pages |
| `CONSOLEAI_CALLBACK_SECRET` | You invent a long random string | Same Pages secrets screen; give the same value to your agents as the `x-consoleai-token` header | agents POSTing long-job results to `/api/agent-callback` |
| `CONSOLEAI_CRON_SECRET` | You invent a different long random string | Pages secrets **and** Worker `consoleai-runner` → Settings → Variables and Secrets | cron Worker calling `/api/run-due` every 5 minutes |

After adding a Pages secret, redeploy (or wait for the next deploy) so the new
deployment picks it up, then re-check `/api/health` — the matching flag flips
to `true`. Secrets are write-only in Cloudflare; rotating one means pasting a
new value in every place listed above.

Also still owner-only in Supabase Auth: Authentication → URL Configuration →
Site URL `https://oasis.abuz8ai.com`, Redirect URLs
`https://oasis.abuz8ai.com/**` and `https://consoleai-abuz8.pages.dev/**`,
then sign in once to create the owner account.

## Dispatch, two ways

1. **Synchronous (default):** UI creates the dispatch row → `POST /api/dispatch`
   → Function POSTs the `consoleai.dispatch.v1` work packet to the agent's
   endpoint and waits up to 55s → output/App/run-steps/credit charge are
   recorded server-side. No endpoint = `safely_halted`. HTTP failure = `errored`.
2. **Asynchronous (long work):** the endpoint accepts the packet quickly
   (or is called directly by your own runner), then later POSTs
   `{dispatch_id, status, output, app?}` to `/api/agent-callback` with the
   callback token. Same recording path. The callback URL and contract ride
   inside every work packet.

An endpoint "builds an App" by returning `app:{name,kind,fields,records[]}`
in its JSON — the App, its records, and a living App card appear in the room.

## Connecting unlimited agents of your own

- There is **no ConsoleAI seat/credit meter for your own use**: if you never
  add credit-ledger entries, dispatch never pauses. Credits exist for when
  *other people's* work must be metered; Stripe purchase is not wired yet.
- Each agent needs **one public HTTPS endpoint** the Cloudflare Function can
  POST to. For agents on Spectre/Pegasus, the standard free door is a
  **Cloudflare Tunnel** (`cloudflared`) mapping e.g.
  `https://hermes.your-domain.example/run` → your local agent bridge.
  You run one tunnel per machine; add as many agents as you like behind it.
- Register each agent in the Agent Lot (name, `@slug`, kind, endpoint),
  add it to the rooms it may work in, and grant connections per agent in the
  Platform tab. Work packets include granted connection **names only** —
  raw third-party secrets never travel in packets.
- v1 honesty: the runner sends no per-agent auth header yet, so protect each
  endpoint itself (unguessable path token, or validate the packet on your
  bridge, and keep the tunnel hostname unlisted). A server-side per-agent
  token vault is a listed future slice, not a shipped claim.

## Paid hosting (you hold the cards; nothing here auto-charges)

- **Cloudflare Workers Paid** (covers Pages Functions + the cron Worker):
  starts at **$5/mo** minimum per Cloudflare's pricing pages. Needed when you
  outgrow free CPU/request allowances or want longer-running dispatch calls.
  Upgrade: Cloudflare dashboard → Workers & Pages → Plans.
- **Supabase Pro**: **$25/mo base** (confirm at checkout; usage-based extras
  exist). Buys no-pausing projects, backups, and compute headroom. Upgrade:
  Supabase dashboard → organization billing. The project was created at a
  $0/mo quote; no payment has been taken.
- **Custom SMTP** (e.g. your existing email provider) becomes wise before
  inviting many users by magic link; Supabase Auth → SMTP settings. Optional.

Free tiers are sufficient to sign in, register agents, and run the first real
dispatches today — pay when volume, not hope, demands it.

## Deploy / dev commands

```bash
# full stack locally (Functions + static; secrets via .dev.vars, git-ignored)
npx wrangler pages dev

# static-only local (dispatch falls back to the in-browser runner)
python -m http.server 8000 --directory web

# preview, then production
npx wrangler pages deploy --branch=backend-preview
npx wrangler pages deploy --branch=main

# cron runner Worker
npx wrangler deploy -c runner/wrangler.jsonc
```

Production today: https://oasis.abuz8ai.com · https://consoleai-abuz8.pages.dev ·
runner https://consoleai-runner.wireconn1.workers.dev
