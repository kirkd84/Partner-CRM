# PartnerRadar Build Status

Cowork updates this file after every meaningful milestone.

---

## 2026-04-23 — ✅ Phase 1 LIVE on Railway + 6 polish iterations

**Kirk is logged in.** `admin@demo.com / Demo1234!` at
`https://partner-crm-production.up.railway.app` lands on Radar with
real seeded data. This is the moment Phase 1 is considered delivered.

### Deploy state

| Piece     | Value                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| GitHub    | `kirkd84/Partner-CRM` · 17 commits on `main` · latest `01f307e`                                                            |
| Railway   | `Partner-CRM` service + `Postgres` service, both Online                                                                    |
| Web URL   | `https://partner-crm-production.up.railway.app`                                                                            |
| DB        | Railway Postgres, schema pushed via `pnpm db:push`, seeded via `pnpm db:seed`                                              |
| Env vars  | DATABASE_URL (reference-resolved), NEXTAUTH_URL (https://), NEXTAUTH_SECRET, ENCRYPTION_KEY — verified set                 |
| Auto-push | Cowork PAT lives in `Partner CRM/.cowork-secrets` (1yr expiry); `scripts/cowork-push.sh` used for every push, zero prompts |

### Design polish iterations (all shipped, all on main)

1. `1147c6f` — baseline polish (SPEC §3.1 tokens, lighter shadows, tighter nav)
2. `ea23e64` — stat count to 38px for visual anchor
3. `9c3528d` — 8-col desktop tile grid + 30-Day Stats row
4. `bc6d5b0` — header polish: bold text, Recent menu, solid +New, prominent bell, Handshake logo
5. `c322d32` — full-width layout, 40% sticky activity rail, leaderboard, icon-chipped stat cards
6. `01f307e` — leaderboard rich metrics: activated / meetings / leads worked per rep

### Kirk's feedback — all addressed

- ✅ Storm uses full width → removed `max-w-[1400px]`
- ✅ Activity needs its own rail → 40% right column, full-height sticky
- ✅ 30-day stats needs icons + belongs below tasks → done (color-tinted icon chips)
- ✅ Add leaderboard with per-rep details → done with 3 metrics, sorted by activated DESC
- ✅ Replace "PR" logo with referral-partner icon → Handshake lucide icon
- ✅ Bolder text, better notification bell → font-semibold across nav, ring-2 badge

---

## 📍 Next up — Phase 2 + Phase 3 (kickoff on return)

Kirk said "kick off phase 2 when usage limit refreshes. I am going home."
Any future Cowork session: read this file, read MEMORY, then start.

**Phase 2 (SPEC §6.2):**

- Partner detail page at `/partners/[id]` — 3-column layout (Contacts / Info-tabs / Activity-tabs) + bottom-split (Files / Expenses-Activities-Messages-Docs-FinancialOverview tabs)
- Contacts CRUD with dashed-blue "+ New contact" pattern
- Activity composer with @mentions + 10s polling
- Appointments + Tasks tabs (internal only — calendar sync is Phase 4)
- File upload to R2 (blocked on Kirk's R2 creds — degrade gracefully until provided)
- Stage dropdown in detail header, advancements logged as Activity(STAGE_CHANGE)
- **"Activate Partner" button (manager+) → mock Storm push → full-screen balloons 🎈** via `react-confetti-boom`, ~30 balloons, ~4s
- Global search (Cmd/Ctrl+K) fuzzy across partners + contacts + tasks in visible scope
- Radar live feed: SSR → 10s polling via React Query

**Phase 3 (SPEC §6.3):**

- `/admin/users` — list, invite, deactivate, hard-delete; invite flow via Resend email → set-password link
- `/admin/markets` — CRUD with timezone, map center, scrape radius
- `/admin/audit-log` — filterable table with diff drawer
- `/settings` — profile, avatar color picker, home/office addresses via Google Places, route defaults, notification prefs

### Running tally of "Blocked on Kirk" env vars

Same as before — Phase 2+3 depends on:

- `RESEND_API_KEY` + verified DKIM/SPF on `rooftechnologies.com` (Phase 3 invite emails)
- `R2_*` creds for Cloudflare bucket (Phase 2 file uploads; app will skip cleanly without)
- `GOOGLE_MAPS_API_KEY` with Places API enabled (Phase 3 address autocomplete)
- `ANTHROPIC_API_KEY` (Phase 7; not blocking 2/3)
- `TWILIO_*` (Phase 7; not blocking)

Without these, Phase 2+3 ships with graceful no-op stubs for those specific features. The rest works end-to-end.
