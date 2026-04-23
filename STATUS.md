# PartnerRadar Build Status

Cowork updates this file after every meaningful milestone.

---

## 2026-04-22 — Build kickoff

**Mode:** Full-autonomous build approved by Kirk. Target: ship Phases 1–11 per SPEC.md §6.

**Kickoff decisions (logged in SPEC.md §10 Amendment log):**
- A001: Deployment → Railway (replaces Vercel + Neon)
- A002: First-customer branding → Roof Technologies, LLC (Wheat Ridge CO); tenant config abstracted for later white-label
- A003: Autonomous build scope — ship all 11 phases before pausing

**Repo state:** `github.com/kirkd84/Partner-CRM` (empty main). SPEC.md, SETUP_AND_PHASES.md, and Storm Cloud screenshots now copied into repo.

---

## Phase 1 — Foundation (in progress)

### Done
- Memory + session context saved
- SPEC.md amended with A001–A003
- STATUS.md + ASSUMPTIONS.md + README.md created
- Roof Tech identity captured for tenant config seed

### Planned (this session)
- Monorepo skeleton: Turborepo + pnpm workspaces, root configs, CI workflow, Dockerfile, railway.json
- `packages/config/src/tenant.ts` — Roof Tech branding single source
- `packages/db` — Prisma schema from SPEC §4, seed script with 3 demo users + Roof Tech markets + 10 seeded partners
- `packages/types` — Zod schemas shared across web + mobile + api
- `packages/ui` — Card, Button, Pill, Avatar, Table, FilterSidebar, DrawerModal, StatusTile, ActivityItem, EmptyState, per SPEC §3
- `packages/api` — tRPC v11 skeleton with auth + permissions middleware
- `packages/ai`, `packages/integrations/storm`, `packages/integrations/scrapers` — stubs with real interfaces
- `apps/web` — Next.js 15 App Router, Tailwind w/ SPEC §3.1 tokens, NextAuth v5 Credentials, login page, global top nav, Radar/Partners placeholder pages
- `apps/mobile` — Expo SDK 51 + Expo Router, NativeWind, bottom-tab shell, login screen

### Blocked on Kirk (not blocking autonomous build; will use placeholders/mocks until resolved)
- API keys: Anthropic, Resend, Twilio, Google Maps, Cloudflare R2, Upstash, Inngest, Sentry — Kirk to drop into Railway env vars when ready
- Railway project ID + PAT for CI auto-deploy (optional; not blocking local dev)
- GitHub push credentials from sandbox — Kirk either runs `git push` himself or provides a PAT
- Production domain — Railway default subdomain used until Kirk picks one
- Final logo + favicon — placeholder wordmark ("PartnerRadar") until Kirk provides
- App Store + Play Store developer accounts — needed before Phase 11 mobile submission
- Apple app-specific password capture UX (Phase 4 deferred decision)
- Storm Cloud API URL / auth / payload shapes — mocked adapter used until API docs land

---

## Next up
Scaffold monorepo → Prisma schema + seed → packages/ui → apps/web → apps/mobile → commit + push.
