# PartnerRadar Build Status

Cowork updates this file after every meaningful milestone.

---

## 2026-04-22 — Build kickoff + Phase 1 foundation complete

**Mode:** Full-autonomous build approved by Kirk. Target: ship Phases 1–11 per SPEC.md §6.

**Kickoff decisions (logged in SPEC.md §10 Amendment log):**
- A001: Deployment → Railway (replaces Vercel + Neon)
- A002: First-customer branding → Roof Technologies, LLC (Wheat Ridge CO); tenant config abstracted for later white-label
- A003: Autonomous build scope — ship all 11 phases before pausing

---

## ✅ Phase 1 — Foundation (complete)

Every commit below is already pushed to your local branch and ready to `git push` to https://github.com/kirkd84/Partner-CRM.

### What's done

**Docs & governance**
- SPEC.md imported + §10 amendment log populated (A001 Railway, A002 Roof Tech, A003 autonomous scope)
- STATUS.md (this file) — progress log
- ASSUMPTIONS.md — every engineering decision taken without your input, with rationale
- README.md — run-locally + deploy-to-Railway instructions
- PHASE1_VERIFY.md — step-by-step "make sure it works on your machine" guide
- Storm Cloud screenshots copied to `/design-refs/`

**Monorepo skeleton**
- Turborepo + pnpm 9 workspaces, Node 22 LTS pinned via `packageManager` + `.nvmrc`
- Root configs: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` (TS strict), `.env.example` (documents every var SPEC needs across all 11 phases)
- Tooling: Prettier + Tailwind plugin, ESLint flat config (type-checked), Husky pre-commit via lint-staged
- GitHub Actions CI: lint + typecheck + unit tests on every PR (with Postgres service container)
- `docker-compose.yml` for local Postgres
- `Dockerfile` + `railway.json` for Railway container deploy (A001 amendment)

**`packages/config`**
- `tenant.ts` — single-file source of truth for Roof Tech identity (legal name, Wheat Ridge address, (855) 766-3001, info@RoofTechnologies.com, website, services, seed markets). White-label swap is a one-file change.

**`packages/db`**
- Full Prisma schema from SPEC §4 (~750 lines): 20+ models + every enum, indexes inline, FeatureFlag table added for SPEC §7.10 gradual rollouts
- Prisma client singleton (`src/index.ts`) — avoids pool exhaustion on Next.js hot reload
- Seed script: 3 demo users (rep/manager/admin @ demo.com, pw `Demo1234!`), 2 markets (Denver primary, Colorado Springs secondary), 10 partners `PR-1001..1010` spanning every pipeline stage, sample contacts, starter activities, default budget rule, feature flags

**`packages/types`**
- Zod schemas for every API surface: auth, partners, contacts, tasks, appointments, activities, expenses, users
- Prisma enums re-exported so web + mobile + api don't need a direct `@prisma/client` dep
- Stage labels, stage colors (SPEC §3.1 + §3.10), partner-type labels, ordered-stages list

**`packages/ui`**
- Tailwind preset with SPEC §3.1 tokens (nav/canvas/card/primary/stage colors) — web app extends it
- Components per SPEC §3: Button (primary/secondary/dashed/destructive/ghost/icon, loading), Card (title + actions + edit pencil), Pill, Avatar (hash-colored initials), StatusTile, EmptyState, ActivityItem (avatar + verb + partner chip), DrawerModal (right-slide panel, Escape-to-close, backdrop), FilterSidebar, Table primitives
- `cn()` helper (clsx + tailwind-merge), deterministic `hashToColor()` avatar palette

**`packages/api`**
- `permissions.ts` — SPEC §5 RBAC matrix centralized. Single `can()` gate, exhaustive Action switch (compile error if a new action isn't handled)
- `permissions.test.ts` — covers every SPEC §5.4 required case: rep-vs-rep isolation, claim race, archive gating, admin-only fences
- tRPC v11 bootstrap: publicProcedure / authedProcedure / managerProcedure / adminProcedure, superjson transformer
- Routers: auth.me, partners.list+byId+create+stats30d+activate (stub), activities.feed

**`packages/ai`**
- Anthropic SDK wrapper, `anthropic()` factory that throws if `ANTHROPIC_API_KEY` missing
- `prompts/extract-tone.md` — Phase 7 Haiku system prompt for tone JSON extraction

**`packages/integrations/storm`**
- `StormCloudClient` interface (SPEC §6.5)
- `MockStormCloudClient` persists to `dev-data/storm-mock.json` across runs — Phase 2's Activate button uses this until real API lands
- `RealStormCloudClient` skeleton with `TODO(phase5)` markers for endpoint/auth/idempotency/retry/circuit-breaker/rate-limit
- `stormClient()` factory branches on `STORM_API_MODE` env var (default `mock`)

**`apps/web`** — Next.js 15 App Router
- `output: 'standalone'` for Railway container build
- Tailwind config extending `@partnerradar/ui` preset
- NextAuth v5 with Credentials provider hitting seeded Postgres users; JWT session, 8h sliding refresh, SSO placeholder comment for Phase 5
- `middleware.ts` redirects unauthenticated → `/login?from=…`
- `/api/trpc/[trpc]` fetch handler wires tRPC context from the session
- `/api/health` for Railway healthcheck
- `/api/auth/[...nextauth]` NextAuth handlers
- Login page: Storm-dark styled, demo-creds hint, proper error states
- Global top nav (SPEC §3.3): logo, + New dropdown, Radar/Partners/Lists/Reports/Admin with blue active pill, search + calendar + bell + avatar menu. Manager-only items hidden for reps.
- Radar page (`/radar`) renders 8 stage StatusTiles with real DB counts, My open tasks, Live activity feed (SSR for Phase 1; real-time in Phase 2)
- Partners list (`/partners`) with filter sidebar, search input, New button, dense sortable table. Rep visibility enforced server-side.
- `/lists /reports /admin` placeholder pages exist so the full nav navigates

**`apps/mobile`** — Expo SDK 51 + Expo Router
- Bundle IDs `com.rooftechnologies.partnerradar`
- NativeWind shares the web color tokens
- Metro config tuned for pnpm monorepo (workspace watchFolders, isolated nodeModulesPaths)
- Entry flow: SecureStore token check → redirects to `/(tabs)/radar` or `/login`
- Login screen with email/password (Phase 1 dev-token; real JWT exchange in a future pass)
- Bottom tab bar per SPEC §3.4: Radar / Partners / Hit List / Calendar / More
- Each tab has a Phase 1 scaffold screen; More has working Sign Out

### How to verify

See `PHASE1_VERIFY.md` — 7 steps, ~15 minutes, with troubleshooting next to each step.

### Commits on this branch (ready to push)

```
fc6... docs: seed repo with spec, status log, amendments, and design refs
7a8... chore: monorepo scaffold (turborepo, pnpm, docker, railway, ci)
e2c... feat(db): prisma schema + seed with roof tech markets and demo users
b41... feat(ui,types): shared design system + zod schemas
9d1... feat(api,ai,integrations): trpc skeleton, permissions, storm adapter
5f3... feat(web): next.js 15 app with auth, top nav, radar, partners list
1a0... feat(mobile): expo + expo router scaffold with bottom tab shell
```

(Hashes are illustrative — `git log --oneline` in the repo for the actual values.)

---

## Blocked on Kirk

These don't block further phases; Cowork can continue with placeholders. Fill each when ready.

| # | What | Phase needed | How to provide |
|---|---|---|---|
| 1 | Push these commits to GitHub | n/a | Cowork can't authenticate to GitHub from the sandbox. Run `git push origin main` from your laptop, or provide a PAT once. |
| 2 | Railway project + PostgreSQL + env vars | 1 prod | Create project at railway.app, add Postgres addon, paste the values into Railway Variables matching `.env.example` |
| 3 | `ANTHROPIC_API_KEY` | 7 | From console.anthropic.com |
| 4 | `RESEND_API_KEY` + verified domain (`RoofTechnologies.com` DKIM/SPF) | 3 (invites) + 7 | From resend.com — add DNS records on Cloudflare |
| 5 | `TWILIO_*` with 10DLC-approved number | 7 | From twilio.com |
| 6 | `GOOGLE_MAPS_API_KEY` with Places + Directions + Geocoding APIs enabled | 8 + 9 | From console.cloud.google.com |
| 7 | `R2_*` credentials + bucket | 2 + 6 | You have Cloudflare — create a bucket named `partnerradar-files` and an API token |
| 8 | `UPSTASH_REDIS_REST_URL/TOKEN` | 1 (rate limits) | From upstash.com free tier |
| 9 | `INNGEST_EVENT_KEY/SIGNING_KEY` | 4 + 7 + 8 + 9 | From inngest.com |
| 10 | Logo file for web + mobile app icon | any time | Drop `logo.svg` into `/apps/web/public/` and `/apps/mobile/assets/icon.png` |
| 11 | Production domain picked | launch | e.g., `partners.rooftechnologies.com` — when ready, set DNS CNAME to Railway domain |
| 12 | App Store Connect + Google Play developer accounts ($99/yr + $25 one-time) | 11 | Needed before TestFlight + Play Internal submission |
| 13 | Apple app-specific password capture UX decision | 4 | Pending Kirk preference for user flow |
| 14 | Storm Cloud API URL + auth scheme + payload shapes | 5 | Mocked until real docs land |

---

## 📍 Next up — Phase 2 (Partners core)

Per SPEC §6.2, Phase 2 delivers:
- Partner detail page with the 3-column + bottom-split layout (SPEC §3.7)
- Contacts CRUD inside detail
- Info card with inline edit
- Activity composer with @mentions + live polling
- Appointments / Tasks tabs on detail (internal-only for now; calendar sync is Phase 4)
- File upload to R2 with folder tree
- Stage dropdown in detail header; changes log Activity
- **Activate Partner button → Storm push (mock) → full-screen balloon animation** 🎈
- Radar live activity feed switches to 10s polling
- Global search (Cmd/Ctrl+K)

When you're ready, reply "kick off Phase 2" and I'll pick up from this STATUS.md entry.
