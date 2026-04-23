# Phase 1 — Verify on your machine

Everything Phase 1 needs is in this repo. Follow these steps to see it running locally (~15 minutes first time). Most errors you might hit have a fix right next to the step that triggers them.

---

## 0 — Install the prerequisites

If you haven't already:

```powershell
# Node 22 LTS — https://nodejs.org
# Git — https://git-scm.com
# Docker Desktop — https://docker.com (for local Postgres)

corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm --version   # expect 9.15.0
```

---

## 1 — Clone + install

```powershell
git clone https://github.com/kirkd84/Partner-CRM.git partnerradar
cd partnerradar
pnpm install
```

`pnpm install` will take a few minutes the first time (it installs Next 15, Expo, Prisma, tRPC, NextAuth, Tailwind, and their dependencies across the workspace).

**If you see peer-dependency warnings**, that's expected — NextAuth 5 beta + Next 15 + React 19 are all new. Warnings are not errors.

**If `pnpm install` fails with a registry error**, you might be behind a corporate proxy or have a stale npm cache. Try:
```powershell
pnpm config set registry https://registry.npmjs.org/
pnpm install
```

---

## 2 — Environment variables

```powershell
cp .env.example .env
```

Open `.env` and set these (the rest can stay as placeholders for Phase 1):

```env
DATABASE_URL=postgresql://partnerradar:partnerradar@localhost:5432/partnerradar?schema=public
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
ENCRYPTION_KEY=<run: openssl rand -base64 32>
```

If you don't have `openssl` on Windows, you can use https://generate-secret.vercel.app/32 or just paste any random 32+ character string.

---

## 3 — Database up

```powershell
pnpm db:up          # Postgres in Docker on :5432
pnpm db:generate    # Prisma client
pnpm db:migrate     # creates tables + applies the initial migration
pnpm db:seed        # 3 users + 2 Roof Tech markets + 10 partners + activities
```

After `db:seed` you should see:

```
🌱 Seeding PartnerRadar for tenant: Roof Technologies, LLC
Markets…
Users…
Partners…
Activities…
✅ Seed complete. Log in at /login with:
   rep@demo.com · manager@demo.com · admin@demo.com (pw: Demo1234!)
```

---

## 4 — Run the web app

```powershell
pnpm --filter web dev
```

Open http://localhost:3000 — you'll get redirected to `/login`.

**Check each role:**
- `admin@demo.com / Demo1234!` → Radar, Partners, Lists, Reports, Admin all visible
- `manager@demo.com / Demo1234!` → same as admin minus admin-only sub-areas
- `rep@demo.com / Demo1234!` → no Reports or Admin in the top nav; Partners list shows only Riley's 7 assigned + unassigned partners (not Morgan's 2)

**Spot check:**
- Radar shows 8 status tiles with non-zero counts from the seeded partners
- Partners list shows 10 rows for admin, subset for rep
- Clicking a status tile filters the partners list
- Signing out drops you back to `/login`

---

## 5 — Run the mobile app (optional for Phase 1)

In a second terminal:

```powershell
pnpm --filter mobile start
```

Scan the QR code with the Expo Go app on your phone (iOS or Android). You'll see:
- Login screen (pre-filled with rep@demo.com)
- Bottom tab bar: Radar / Partners / Hit List / Calendar / More

The mobile login currently stores a dev token in SecureStore and redirects to the tab shell — real mobile JWT exchange lands in a later pass.

---

## 6 — Run the tests

```powershell
pnpm test
```

You should see the permissions test suite pass (SPEC §5.4 required tests):
- Rep A cannot view Rep B's partners
- Rep A cannot mutate Rep B's partners
- Manager sees everything in their markets
- Admin-only actions FORBIDDEN to managers
- Claim race: only one rep wins

---

## 7 — If something breaks

Report the exact error to Cowork and we'll fix it. Common first-run issues:

| Symptom | Fix |
|---|---|
| `Cannot find module '@prisma/client'` | `pnpm db:generate` didn't run — run it. |
| Login always fails "Invalid email or password" | Did `pnpm db:seed` run? Check: `pnpm db:studio` → open `User` table. |
| `ECONNREFUSED 127.0.0.1:5432` | Docker Postgres isn't up. `pnpm db:up`, wait 10s, retry. |
| `Error: @partnerradar/ui not found` | `pnpm install` at the repo root, not inside a workspace. |
| Tailwind classes don't apply on mobile | Restart `pnpm --filter mobile start` — NativeWind caches at boot. |

---

## What Phase 1 is NOT

By design, these are stubbed and will be built in Phase 2+:

- Partner **detail** page (clicking a partner row works, but the detail page ships in Phase 2 with the 3-column layout and balloons)
- "+ New partner" drawer form (Phase 2)
- Activation button → Storm push → balloons (Phase 2)
- Calendar sync, AI drafting, expense approvals, scrape queue, hit-list planning (Phases 4–9)
- Full real-time activity feed (Phase 2 adds WebSocket / polling; Phase 1 is SSR-only)

If it's not in the checklist above, we'll get to it in the next phase.

---

## Next up

Reply in Cowork with a screenshot or `pnpm --filter web build` output if anything's off. Otherwise say "kick off Phase 2" and Cowork will read STATUS.md, pick up from here, and build the partners detail view + Radar live feed + Activation → Storm + balloon animation.
