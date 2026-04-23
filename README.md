# PartnerRadar

Internal CRM for the **prospecting phase** of referral-partner acquisition at Roof Technologies. Activated partners flow to [Storm Cloud](https://app.storm.cloud) via integration.

> See [`SPEC.md`](./SPEC.md) for the authoritative product + engineering spec. This README only covers *how to run it*.

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

| Email | Role | Password |
|---|---|---|
| `admin@demo.com` | Admin | `Demo1234!` |
| `manager@demo.com` | Manager | `Demo1234!` |
| `rep@demo.com` | Rep | `Demo1234!` |

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

| Var | Purpose | Required Phase |
|---|---|---|
| `DATABASE_URL` | Postgres connection | 1 |
| `NEXTAUTH_SECRET` | JWT signing | 1 |
| `NEXTAUTH_URL` | Base URL for callbacks | 1 |
| `ENCRYPTION_KEY` | AES-256-GCM for OAuth tokens (generate with `openssl rand -base64 32`) | 1 |
| `ANTHROPIC_API_KEY` | Claude Sonnet/Haiku | 7 |
| `RESEND_API_KEY` | Transactional email | 3 (invites) + 7 (drafts) |
| `TWILIO_*` | SMS | 7 |
| `GOOGLE_MAPS_API_KEY` | Places + Directions | 8 + 9 |
| `R2_*` | Cloudflare R2 file storage | 2 (files) + 6 (receipts) |
| `UPSTASH_REDIS_*` | Rate limiting | 1 |
| `INNGEST_*` | Background jobs | 4 + 7 + 8 + 9 |
| `STORM_API_MODE` | `mock` or `real` | 5 |
| `SENTRY_DSN` | Error monitoring | 1 (optional) |

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
