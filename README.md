# PartnerRadar

Internal CRM for the **prospecting phase** of referral-partner acquisition at Roof Technologies. Activated partners flow to [Storm Cloud](https://app.storm.cloud) via integration.

> See [`SPEC.md`](./SPEC.md) for the authoritative product + engineering spec. This README only covers _how to run it_.

---

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **Web:** Next.js 15 (App Router, standalone output) + TypeScript strict + Tailwind + shadcn/ui + tRPC v11 + NextAuth v5
- **Mobile:** Expo SDK 51 + Expo Router + NativeWind
- **DB:** PostgreSQL (Railway managed prod, Docker Compose locally) + Prisma 5
- **Hosting:** [Railway](https://railway.app) for web + DB, EAS for mobile, Cloudflare R2 for files
- **Jobs:** Inngest Cloud
- **AI:** Anthropic Claude (Sonnet for drafting, Haiku for tone extraction)

---

## Prerequisites

- Node 20 LTS or later (Node 22 recommended)
- `pnpm` 9.x (install with `corepack enable && corepack prepare pnpm@9 --activate`)
- Git
- Docker Desktop (for local Postgres — optional; you can point at a Railway staging DB instead)

---

## First-time local setup

```bash
git clone https://github.com/kirkd84/Partner-CRM.git partnerradar
cd partnerradar
pnpm install
cp .env.example .env          # fill in DATABASE_URL and any API keys you have
pnpm db:up                    # starts Postgres via Docker Compose (or skip if using Railway staging)
pnpm db:migrate               # apply Prisma migrations
pnpm db:seed                  # 3 demo users, 2 Roof Tech markets, 10 seeded partners
pnpm dev                      # web on :3000, mobile Expo on :8081
```

**Demo credentials (after seed):**

| Email              | Role    | Password    |
| ------------------ | ------- | ----------- |
| `admin@demo.com`   | Admin   | `Demo1234!` |
| `manager@demo.com` | Manager | `Demo1234!` |
| `rep@demo.com`     | Rep     | `Demo1234!` |

---

## Common commands

```bash
pnpm dev             # all apps in dev (web + mobile)
pnpm --filter web dev
pnpm --filter mobile start
pnpm build           # full workspace build
pnpm typecheck       # tsc --noEmit across workspace
pnpm lint            # eslint
pnpm test            # vitest unit tests
pnpm test:e2e        # playwright (web)
pnpm db:studio       # prisma studio GUI
```

---

## Environment variables

See [`.env.example`](./.env.example) for the full list. The minimal set for Phase 1 dev:

| Var                   | Purpose                                                                | Required Phase           |
| --------------------- | ---------------------------------------------------------------------- | ------------------------ |
| `DATABASE_URL`        | Postgres connection                                                    | 1                        |
| `NEXTAUTH_SECRET`     | JWT signing                                                            | 1                        |
| `NEXTAUTH_URL`        | Base URL for callbacks                                                 | 1                        |
| `ENCRYPTION_KEY`      | AES-256-GCM for OAuth tokens (generate with `openssl rand -base64 32`) | 1                        |
| `ANTHROPIC_API_KEY`   | Claude Sonnet/Haiku                                                    | 7                        |
| `RESEND_API_KEY`      | Transactional email                                                    | 3 (invites) + 7 (drafts) |
| `TWILIO_*`            | SMS                                                                    | 7                        |
| `GOOGLE_MAPS_API_KEY` | Places + Directions                                                    | 8 + 9                    |
| `R2_*`                | Cloudflare R2 file storage                                             | 2 (files) + 6 (receipts) |
| `UPSTASH_REDIS_*`     | Rate limiting                                                          | 1                        |
| `INNGEST_*`           | Background jobs                                                        | 4 + 7 + 8 + 9            |
| `STORM_API_MODE`      | `mock` or `real`                                                       | 5                        |
| `SENTRY_DSN`          | Error monitoring                                                       | 1 (optional)             |

---

## Deploying to Railway

Push to `main` triggers Railway's build from `Dockerfile` + `railway.json`. Migrations run in a pre-deploy step via `pnpm db:migrate:prod`.

```bash
# First-time project link (one-off, on your laptop):
railway login
railway link                  # select the PartnerRadar project
railway variables set DATABASE_URL=...   # set each env var
git push origin main          # triggers deploy
```

Railway PR environments create isolated preview URLs automatically if enabled on the project.

---

## Deploying mobile (Phase 11)

```bash
cd apps/mobile
eas build --platform ios --profile preview   # TestFlight
eas build --platform android --profile preview   # Play Internal
```

---

## Repo layout

```
partnerradar/
├── apps/
│   ├── web/              Next.js 15 app
│   └── mobile/           Expo RN app
├── packages/
│   ├── api/              tRPC routers + business logic
│   ├── db/               Prisma schema + generated client
│   ├── ui/               Shared React components (web)
│   ├── types/            Zod schemas + TS types
│   ├── ai/               Claude prompts + helpers
│   ├── config/           Tenant config (single file to swap for white-label)
│   └── integrations/     Storm, Twilio, Resend, Google Maps, scrapers
├── dev-data/             Local mock data (gitignored)
├── design-refs/          Storm Cloud screenshots (design reference)
├── docker-compose.yml    Local Postgres
├── Dockerfile            Railway web build
├── railway.json          Railway deploy config
├── turbo.json            Turborepo pipeline
├── SPEC.md               Authoritative product + engineering spec
├── STATUS.md             Build progress log
└── ASSUMPTIONS.md        Decisions made without explicit input
```

---

## Contributing style (and a note for future Cowork sessions)

- SPEC.md is source of truth. If code conflicts with SPEC, SPEC wins unless §10 is amended.
- STATUS.md updated after every meaningful milestone (who, when, what, what's next, what's blocked).
- Conventional commits: `feat: …`, `fix: …`, `chore: …`, `docs: …`, `refactor: …`, `test: …`
- Never force-push; never skip hooks.

---

## Production launch guide

When you're ready to onboard the first real rep team, work through `/admin/launch-checklist` in the deployed app — it surfaces every required vs. graceful env var with green/red status and links to fix each one. The notes below are the same content for grepping from the repo:

### Required (platform won't work without these)

| Var                                  | Purpose                                            |
| ------------------------------------ | -------------------------------------------------- |
| `DATABASE_URL`                       | Postgres connection string                         |
| `NEXTAUTH_SECRET` (or `AUTH_SECRET`) | Session cookie signing — `openssl rand -base64 32` |
| `NEXTAUTH_URL`                       | Base URL for OAuth callbacks                       |

### Required for outbound communication

| Var                                                               | Without it                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `RESEND_API_KEY`                                                  | Cadences + RSVPs + expense receipts log "would send" but don't |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` | SMS cadence steps log but don't fire                           |

### Required for the map / lasso scrape

| Var                                                      | Without it                                               |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `GOOGLE_MAPS_API_KEY`                                    | `/map` falls back to a list view                         |
| `GOOGLE_PLACES_API_KEY` (or reuse `GOOGLE_MAPS_API_KEY`) | Lasso "Find new leads" + Google Places scrape jobs throw |

> Best practice: separate keys. The Maps key has an HTTP referrer restriction (locked to your domain); the Places key has none (server-side only) so it works from cron jobs.

### Recommended (graceful fallbacks if missing)

| Var                                                                       | What you lose without it                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                                                       | LLM director / draft drawer / intent extractor → falls back to rule-based  |
| `FAL_KEY`                                                                 | AI image gen in marketing wizard → falls back to solid color blocks        |
| `R2_BUCKET` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` + `R2_ENDPOINT` | Image uploads stored as base64 in Postgres                                 |
| `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`                               | Falls back to `/api/cron/scrape-tick` external cron                        |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push silently disabled                                                 |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`                               | "Sign in with Google" hidden — credentials sign-in still works             |
| `SENTRY_DSN`                                                              | Errors only land in Railway logs                                           |
| `CRON_SECRET`                                                             | `/api/cron/scrape-tick` returns 503 — scheduled scrape jobs never auto-run |

### Operations endpoints

- `GET /api/health` — Railway healthcheck. Returns 200 with `{ ok, version, uptime, checks }` when healthy, 503 when DB unreachable. Point any external uptime monitor at this URL.
- `POST /api/cron/scrape-tick` (header `x-cron-secret: $CRON_SECRET`) — runs one tick of the scrape scheduler. Wire to Railway → Settings → Cron Schedules every 5 min, or use any external cron (cron-job.org, GitHub Actions on schedule).
- `GET /api/cron/scrape-tick` (same header) — diagnostics: lists active jobs + when each is next due.
- `GET /api/admin/partners/export?marketId=…` — CSV download of partner data (admin/manager only). Useful for backups and onboarding new managers.

### Auto-migrate

`apps/web/src/instrumentation.ts` runs idempotent DDL on every server boot, so schema changes deploy by `git push` alone — no `prisma db push` step required. The flow:

1. Edit `packages/db/prisma/schema.prisma`.
2. Mirror the change in `instrumentation.ts` as an idempotent statement (`CREATE TABLE IF NOT EXISTS`, `DO $$ BEGIN IF NOT EXISTS … END $$`, etc.).
3. Push to `main`. Railway redeploys. The new code sees the new schema.
4. Set `SKIP_AUTO_MIGRATE=1` to bail if a migration ever wedges.

### PWA install (mobile reps)

The web app ships a manifest + icon set, so reps can install it as a fullscreen app on their phone:

- **iOS:** Safari → Share → Add to Home Screen.
- **Android:** Chrome → menu → Install app.

After install it opens at `/radar` directly, no Safari chrome.

### Things that explicitly DON'T scale yet

- **In-process scrape scheduler is single-dyno only.** If you ever scale Railway above 1 instance, two dynos will both try to run the same cron job at the same time. Mostly harmless (`runIngest` dedupes by hash) but wastes Google Places quota. Wire Inngest before scaling out.
- **`/tmp` is ephemeral on Railway.** State board CSVs live at `/tmp/state-boards/<file>` for the life of the dyno; on redeploy they vanish and `/admin/scrape-jobs` "Run now" will throw "CSV missing." Re-upload via `/admin/state-boards`. R2 fixes this — see the env var table above.
- **PDF generation is synchronous.** First render after a deploy takes 3-5 seconds (Satori spins up + native binary loads). Subsequent renders are fast.
