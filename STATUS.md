# PartnerRadar Build Status

Cowork updates this file after every meaningful milestone.

---

## 2026-04-23 — ✅ Phase 2 + Phase 3 SHIPPED

Kirk said "continue" and Cowork ran Phases 2+3 through to completion in
one sitting. Everything is live on Railway once the new commits deploy.

### Phase 2 — Partners core (SPEC §6.2)

| Commit  | Scope                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| b82f3c7 | Partner detail page + Activate → mock Storm Cloud → 🎈 balloon celebration (prefers-reduced-motion honored) |
| bd8e034 | Contacts + Tasks + Appointments drawers wired (dashed-blue "+ New" pattern per SPEC §3.13)                  |
| 905a522 | New Partner drawer on `/partners` list + server-side search (companyName / PR-#### / city)                  |
| 23c0f73 | ⌘K global command palette — partners + contacts + tasks, debounced, keyboard-nav                            |

**What works now:**

- `/partners/[id]` 3-col top (Contacts / Info / Activity rail) + bottom split (Tasks / Appointments / Files).
- Contacts: add / mark-primary / delete via row actions.
- Tasks: create via drawer, complete with optimistic checkbox, priority pills.
- Appointments: create via drawer that mirrors Storm Cloud's event modal. Type pill on each row.
- Stage dropdown + Activate button fire `changeStage` / `activatePartner` server actions with audit trail.
- Activate button (manager+) runs mock Storm Cloud push, persists `stormCloudId`, fires balloons 🎈, haptic buzz on mobile.
- `/partners` list: stage filter sidebar + toolbar with "+ New" drawer + search box + live `q=` URL param.
- ⌘K / Ctrl+K anywhere pops a centered palette, jumps to any partner/contact/task in your market scope.

### Phase 3 — Admin + Settings (SPEC §6.3)

| Commit  | Scope                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------- |
| 62c8a14 | Admin shell (sidebar + overview) + `/admin/users` (invite, roles, markets, deactivate, delete)     |
| aad07c5 | `/admin/markets` CRUD (name, timezone, lat/lng center, scrape radius, CAN-SPAM address)            |
| aab27fc | `/admin/audit-log` — filterable by user / entity / action / date range, diff drawer on each row    |
| c8a9c0a | `/settings` — profile, avatar palette, addresses, route defaults, map app, notifications, password |

**What works now:**

- `/admin` dashboard tiles to sub-pages with live counts.
- `/admin/users`: Invite user drawer → returns temp password to copy/share until Resend is wired. Per-row menu: Edit role+markets, Reset password, Deactivate/Reactivate, Delete (ADMIN only, refuses if user has activity history). Self-row guarded.
- `/admin/markets`: CRUD with shared drawer. Delete refuses if partners or users are still attached.
- `/admin/audit-log`: ADMIN-only; every mutation across the app writes a row; clickable "View diff" shows the full JSON payload.
- `/settings`: profile form with live Avatar preview, 10-color palette picker, home/office addresses, route-start default, map app preference, notification toggles (task-due / stage / activation / mentions), sound effects. Password card with current/new/confirm + auto-invalidation of other sessions via `tokenVersion` bump.

Every write-path goes through `assertCanEdit` / `assertIsManagerPlus` / `assertIsAdmin` helpers and emits an `AuditLog` entry with `diff`.

### Deploy state

| Piece     | Value                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------ |
| GitHub    | `kirkd84/Partner-CRM` · `main` is the green tip                                                  |
| Railway   | `Partner-CRM` service + `Postgres` service, both Online — new builds auto-triggered by each push |
| Web URL   | `https://partner-crm-production.up.railway.app`                                                  |
| DB        | Railway Postgres — no new migrations required for Phase 2/3 (schema was already comprehensive)   |
| Auto-push | `scripts/cowork-push.sh` used for every push, zero prompts                                       |

---

## 📍 Next up — Phase 4 (Map, Hit List, Routes)

Phase 4 is the mobile-first tour planner. The SPEC calls for:

- `/map` page — interactive map with partner pins colored by stage, market-bounded
- Hit List builder — save curated lists of partners to visit; drag-reorder; TSP-ish optimize
- Routes — given a start (HOME / OFFICE / LAST_STOP / CUSTOM) and a hit list, generate a driving order, deep-link to Google/Apple Maps
- Appointments linked to routes ("stops") so the visit auto-logs a check-in

### Blocked on Kirk (creds needed)

- `GOOGLE_MAPS_API_KEY` with Maps JS + Places + Directions enabled → Phase 4 map, address autocomplete, directions
- `RESEND_API_KEY` + verified DKIM/SPF on `rooftechnologies.com` → switch invite from temp-password to real magic-link email
- `R2_*` Cloudflare bucket creds → Phase 2 file uploads (currently an empty-state card that says "uploads land when creds wired")
- `ANTHROPIC_API_KEY` → Phase 7 AI Follow-ups + tone calibration
- `TWILIO_*` → Phase 7 SMS outbound

Without these, the rest of Phase 4 still ships — the map falls back to a static marker list until Maps is keyed.

---

## 2026-04-23 — ✅ Phase 1 LIVE on Railway + 6 polish iterations

**Kirk is logged in.** `admin@demo.com / Demo1234!` at
`https://partner-crm-production.up.railway.app` lands on Radar with
real seeded data.

### Design polish iterations (all shipped)

1. `1147c6f` — baseline polish (SPEC §3.1 tokens, lighter shadows, tighter nav)
2. `ea23e64` — stat count to 38px for visual anchor
3. `9c3528d` — 8-col desktop tile grid + 30-Day Stats row
4. `bc6d5b0` — header polish: bold text, Recent menu, solid +New, prominent bell, Handshake logo
5. `c322d32` — full-width layout, 40% sticky activity rail, leaderboard, icon-chipped stat cards
6. `01f307e` — leaderboard rich metrics: activated / meetings / leads worked per rep
