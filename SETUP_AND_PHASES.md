# PartnerRadar — Setup & Phase Prompts (for Kirk)

This is your working document. You read it; Cowork reads `SPEC.md`. Keep this open as a reference. Work through sections top to bottom.

---

## Part 1 — One-time setup (do this once, ~45 minutes)

### 1.1 Install prerequisites on your Windows machine

Install these in order. Accept defaults unless noted.

1. **Node.js 20 LTS** — download from https://nodejs.org (choose LTS installer). This gives you `node` and `npm`.
2. **pnpm** — open PowerShell as your normal user and run: `npm install -g pnpm`
3. **Git** — download from https://git-scm.com. During install, accept all defaults.
4. **Docker Desktop** — download from https://docker.com/products/docker-desktop. You'll run Postgres in it. Enable WSL2 when prompted.
5. **VS Code** (optional but helpful for peeking at what Cowork builds) — https://code.visualstudio.com
6. **Claude Desktop** — you should already have this since you're on Max. Make sure it's updated to the latest version.

### 1.2 Create accounts and grab API keys

You'll need these. Keep them in a password manager — we'll give them to Cowork in a `.env` file later.

| Service | Purpose | Signup link | Free tier OK? |
|---|---|---|---|
| **Anthropic Console** | Claude API for AI features | https://console.anthropic.com | $5 credit free, then pay-as-you-go |
| **Resend** | Transactional email | https://resend.com | 3,000/mo free |
| **Twilio** | SMS | https://twilio.com | ~$15 trial credit |
| **Google Cloud** | Maps API + Places API | https://console.cloud.google.com | $200/mo free credit |
| **Neon** | Managed Postgres (simpler than running Docker long-term) | https://neon.tech | Generous free tier |
| **Cloudflare R2** | File storage | https://dash.cloudflare.com | 10 GB free |
| **Upstash** | Redis for rate limiting | https://upstash.com | 10k commands/day free |
| **Inngest** | Background jobs | https://inngest.com | Generous free tier |
| **Vercel** | Web deployment | https://vercel.com | Free hobby tier fine for starting |
| **Sentry** | Error monitoring (optional for v1) | https://sentry.io | Free tier fine |

Don't stress about getting all of these before you start. You need **Anthropic Console + Neon** minimum for Cowork to start building. The rest can be added as each phase calls for them.

### 1.3 Create the project folder

Open PowerShell and run:

```powershell
cd $HOME
mkdir PartnerRadar
cd PartnerRadar
git init
```

Then copy two files into `C:\Users\<you>\PartnerRadar`:
- `SPEC.md` (the product spec I'm providing)
- `STATUS.md` (create this empty; Cowork will update it as it works)

To create an empty STATUS.md:
```powershell
"# PartnerRadar Build Status`n`nCowork updates this file after every meaningful step." | Out-File -Encoding utf8 STATUS.md
```

### 1.4 Connect Claude in Chrome (the browser tool)

You already have this running. Good. Cowork will use it to keep referencing Storm Cloud's UI as it builds. When Cowork asks to peek at Storm, you may need to log in the first time.

### 1.5 Configure Cowork global instructions (one-time)

Open Claude Desktop → **Settings** → **Cowork** → click **Edit** next to **Global instructions**. Paste this exact block:

```
I am a non-technical stakeholder building an internal CRM called PartnerRadar. I am on Windows. My project folder is C:\Users\<your-username-here>\PartnerRadar.

Operating principles when you work in this folder:

1. Read SPEC.md at the start of every task. It is the source of truth for the product.
2. Read STATUS.md to see what has already been completed. Update STATUS.md after every meaningful milestone with date, what you did, and what's next.
3. Work in phases as defined in SPEC.md §6. Do not start a new phase until I explicitly kick it off. If I give you a phase goal, complete that phase fully before stopping.
4. Commit to git after every logical chunk of work. Use conventional commit messages (feat:, fix:, chore:, etc.). Do not force-push. Do not delete branches I have not approved.
5. Ask me before: (a) creating accounts on third-party services, (b) making decisions that will cost money beyond trivial API usage, (c) deviating from the tech stack in SPEC.md §1, (d) skipping or reordering phases, (e) any irreversible destructive operation.
6. When you need information I haven't provided (like API keys, Storm Cloud API details, my company name, logo, branding), add a TODO to STATUS.md under "Blocked on Kirk" and proceed with sensible defaults clearly marked with `// TODO: replace with real value` in the code.
7. Write tests as you go. Do not defer testing.
8. Prefer shipping a smaller, working feature over a bigger, half-done one. If a phase is taking too long, finish the core and note deferred items in STATUS.md.
9. Use Claude in Chrome freely to reference https://app.storm.cloud when you need to check design or UX details. You can also use it to search docs for the stack components.
10. When you encounter a scraping target, respect robots.txt and rate limit politely.

Communication style: be concise, show me what you did, and tell me the next decision I need to make. Don't ask me to confirm routine engineering choices — just make them and note them in STATUS.md.
```

Replace `<your-username-here>` with your actual Windows username. Save.

### 1.6 Configure folder-specific instructions

In Claude Desktop, inside Cowork, select your PartnerRadar folder. Click the folder settings → **Folder instructions**. Paste:

```
This is the PartnerRadar CRM project. SPEC.md in this folder is the authoritative product spec. STATUS.md tracks progress. .env (create it if needed, never commit it) holds secrets.

Before writing code:
- Run `git status` to see where I am
- Read STATUS.md to see what's done
- Read SPEC.md sections relevant to the current task

Before finishing:
- Run tests
- Update STATUS.md
- Commit with a clear message
- Tell me explicitly what the next kickoff prompt should be
```

---

## Part 2 — How to use this document

The build is broken into **11 phases**. You'll paste one phase prompt at a time into Cowork. Cowork will work through the phase, likely spawning sub-agents for parallel sub-tasks. When it finishes a phase, it'll tell you and update STATUS.md. You review, commit, then kick off the next one.

**Expected cadence:**
- Phase 1 (Foundation): ~1 day of Cowork runtime
- Phase 2 (Partners core): ~2 days
- Phases 3–10: ~1–3 days each
- Phase 11 (Mobile polish): ~2 days
- **Total: ~3–5 weeks of wall-clock time, with you doing ~30–60 min of review between phases.**

**Important Windows gotcha**: Cowork needs the Desktop app open to keep working. Go to Settings → System → Power & Battery on Windows and set:
- Screen: Never turn off (when plugged in)
- Sleep: Never (when plugged in)
- When I close the lid: Do nothing (if laptop; set this under "Additional power settings" → "Choose what closing the lid does")

### Checkpoint protocol between phases

When Cowork says a phase is complete:

1. Read the STATUS.md entry it wrote
2. Open the app locally and click around to spot-check (Cowork will tell you how to run it — likely `pnpm dev` in the repo root)
3. Read the new diff in VS Code or GitHub Desktop
4. If anything looks off, tell Cowork: *"Before we move on, [specific issue]. Fix that first."*
5. When happy, commit + push (Cowork can do this but you confirming is a safety net)
6. Paste the next phase kickoff prompt from Part 3 below

---

## Part 3 — Phase kickoff prompts

Paste these one at a time, in order, as tasks in Cowork. Each is designed to be complete and self-contained.

---

### Phase 1 kickoff — Foundation

```
Read SPEC.md in full. Read STATUS.md.

Your goal for this task: complete Phase 1 (Foundation) as defined in SPEC.md §6.1. This means:

- Initialize the Turborepo monorepo with pnpm workspaces matching the structure in SPEC.md §1
- Install and configure all the dev tooling (TypeScript strict mode, ESLint, Prettier with Tailwind plugin, Husky, lint-staged)
- Set up the Prisma schema from SPEC.md §4, run the initial migration against a local dev database (use Docker Compose for Postgres), write the seed script with 3 users (one per role: rep@demo.com / manager@demo.com / admin@demo.com, password: Demo1234!), 2 markets (Denver CO, Kansas City KS), and 10 partners across various stages
- Build the design-token Tailwind config from SPEC.md §3, set up shadcn/ui, build the shared UI component package (packages/ui) with these components: Card, Button, Pill, Avatar, Table, FilterSidebar, DrawerModal, StatusTile, ActivityItem, EmptyState. Match the Storm Cloud design language. Reference app.storm.cloud via Claude in Chrome if you need to confirm details.
- Set up NextAuth v5 with Credentials provider on apps/web. Password reset flow can be stubbed for now (just log the reset link to console).
- Build the global navigation shell for web (top nav per SPEC.md §3, showing + New / Radar / Partners / Lists / Reports / Admin). Active-state matches Storm Cloud.
- Scaffold apps/mobile with Expo and Expo Router. Set up NativeWind. Build a basic login screen and a bottom-tab shell with the same top-level sections. Use Expo SecureStore for token persistence.
- Set up a market selector in the nav if the logged-in user belongs to >1 market
- Set up GitHub Actions CI with lint, typecheck, and unit tests
- Write a README with "how to run locally" and "how to deploy"

Acceptance: I should be able to `pnpm dev` at the repo root, open localhost:3000, log in as any of the three seeded users, see the Radar placeholder page with the correct role-specific nav, and navigate between top-level sections. Mobile should run in Expo Go showing the login + shell.

When complete, update STATUS.md and tell me exactly what to do to run and verify.
```

---

### Phase 2 kickoff — Partners core (CRUD + detail + Radar dashboard)

```
Confirm Phase 1 is merged and working by reading STATUS.md. If not, stop and tell me what's incomplete.

Your goal for this task: complete Phase 2 (Partners core) as defined in SPEC.md §6.2.

Reference the Storm Cloud screenshots in /design-refs/ (if I haven't added them, ask me; otherwise browse app.storm.cloud via Claude in Chrome to confirm detailed styling).

Build:
- Partners list view at /partners — dense sortable table, filter sidebar, search, "New" button opening a right-drawer form. Match the Storm "Referral Partners" list screenshot down to spacing and typography.
- Partner detail view at /partners/[id] — 3-column layout (Contacts / Info / Activity-tabs) + bottom split (Files / Expenses-Activities-Messages-Documents-FinancialOverview tabs) per SPEC.md §3
- Contacts CRUD within the detail view, with dashed blue "+ New contact" button
- Info editing via inline "Edit info" button that turns the card into a form
- Comment composer with @mentions (list users in scope, mentioning triggers an in-app notification)
- Appointments tab on detail view (local only for now — calendar sync is Phase 4). Right-drawer form matching Storm's Calendar Event drawer (screenshot I shared).
- Tasks tab
- File upload: integrate with Cloudflare R2 (ask me for R2 credentials if not in .env yet). Folder-based organization, drag-drop upload.
- Stage dropdown in detail view header; stage changes logged as Activity
- "Activate Partner" button (manager+ only) in top-right action strip. Confirmation modal. On success: set stage=ACTIVATED, trigger stub Storm push (log payload, mark activatedAt), log to AuditLog, AND render a full-screen balloon animation (use react-confetti-boom or equivalent, ~30 colored balloons rising for ~4 seconds). This balloon animation is required and must be delightful.
- Radar dashboard at /radar (landing page) — left column: pipeline status tile grid (clickable, routes to /partners?stage=X), Tasks widget, 30-day stats widget. Right column: live Activity feed (polling every 10s is fine for v1). Match Storm Radar screenshot.
- Global search from nav — fuzzy search across partners, contacts, tasks, appointments within user's visible scope
- All tRPC procedures must enforce permission rules from SPEC.md §5. Write unit tests for the permission checker proving reps cannot see other reps' partners.

Acceptance: Seeded rep user can only see their own + unassigned partners. Seeded manager can see everything. Creating a partner, advancing through stages, adding contacts/notes/tasks/files all work end-to-end. Clicking Activate fires balloons. Radar shows real counts.

Update STATUS.md, commit, and tell me the exact steps to verify.
```

---

### Phase 3 kickoff — Users, Markets, Permissions Admin

```
Confirm Phase 2 is complete via STATUS.md. 

Complete Phase 3 (Users, Markets, Permissions Admin) per SPEC.md §6.3:

- Admin > Users page: list all users with role/market assignments, create, edit, deactivate (manager+), hard delete (admin only)
- Admin > Markets page: CRUD markets with timezone, default map center, scrape radius
- Admin > Audit Log page: filterable table (user, entity type, entity ID, action, date range). Paginated.
- User settings page (/settings): profile, avatar color picker, home address, office address, default route start mode (HOME/OFFICE/LAST_STOP), notification preferences (toggle in-app, browser push, mobile push per category)
- User invite flow: admin/manager creates user with email + role + markets → system emails an invite link (via Resend) that sets password

Write tests confirming that a rep cannot access /admin/* routes (403 or redirect with toast).

Update STATUS.md and commit.
```

---

### Phase 4 kickoff — Calendar & Appointments

```
Confirm Phase 3 is complete.

Complete Phase 4 (Calendar & Appointments) per SPEC.md §6.4:

- Google Calendar OAuth connection flow in user settings (store tokens encrypted)
- Apple iCloud Calendar via CalDAV (user enters Apple ID + app-specific password; store encrypted)
- Storm Cloud calendar pull: build integration stub that returns mock appointments for now (document the expected shape in integrations/storm/README.md)
- Inngest job: every 15 minutes, pull new/updated events from connected calendars for each user; cache in a CalendarEventCache table (add to Prisma schema); mark external events read-only
- Unified /calendar page with month/week/day/list switcher (match Storm's calendar switcher styling)
- Appointment drawer matching Storm's Calendar Event drawer exactly (screenshot reference): Appointment type dropdown (editable list in admin), Partner link (optional async autocomplete), All-day toggle, Start date + time, Duration + unit (min/hrs), Assigned to, Notes, Save button
- Conflict detection: warn on overlap with existing events (internal or external), non-blocking
- Notifications: in-app + browser push + mobile push at T-15min before appointment. No email.
- On partner detail, the Appointments tab shows only that partner's appointments; /calendar shows all for the logged-in user

Update STATUS.md and commit.
```

---

### Phase 5 kickoff — Storm Cloud integration adapter

```
Confirm Phase 4 is complete.

Complete Phase 5 (Storm Cloud integration) per SPEC.md §6.5:

Note: the real Storm Cloud API is not available yet. Build the adapter so it's swappable.

- packages/integrations/storm/ with:
  - Typed client interface (StormCloudClient)
  - MockStormCloudClient implementation that logs all calls and returns plausible responses (writes to a local JSON file at dev-data/storm-mock.json so data persists across runs)
  - RealStormCloudClient skeleton with TODO markers for Kirk to fill in once API docs land
  - Factory that returns one or the other based on STORM_API_MODE env var (default: mock)
  - Retry with exponential backoff, idempotency keys, rate limiting, circuit breaker
- Activation push: when a partner is activated, serialize partner + primary contact + notes into the expected payload (document assumptions in ASSUMPTIONS.md at project root), call client.createReferralPartner(), store returned stormCloudId on Partner
- Revenue attribution: Inngest job every 6 hours; for each partner with stormCloudId, call client.getAttributedRevenue(stormCloudId, since: partner.activatedAt); upsert RevenueAttribution records
- Appointment pull from Storm: for each Activated partner, pull appointments the partner is involved in; surface on rep's calendar as read-only with a "from Storm" indicator
- Webhook receiver endpoint at /api/webhooks/storm (stubbed; document expected events in ASSUMPTIONS.md)
- Admin > Integrations page: show Storm connection status (mock vs real), test connection button, last sync time, recent events
- SSO preparation: add stormCloudUserId field to User (already in schema), add a comment in auth config showing where OAuth/SAML will plug in

Update STATUS.md and commit.
```

---

### Phase 6 kickoff — Expenses + Budget

```
Confirm Phase 5 is complete.

Complete Phase 6 (Expenses + Budget rules) per SPEC.md §6.6:

- Expense submission drawer on partner detail: upload receipt (image or PDF to R2), amount, category (Meal/Gift/Event/Travel/Other — editable list), description, date
- Approval routing engine:
  - amount ≤ autoApproveUnder → auto-approved, logged
  - amount ≤ managerApproveUnder → pending, notify rep's market managers in-app
  - amount > managerApproveUnder → pending, notify admins in-app
  - Defaults: $25 / $100 per SPEC.md §6.6, but editable per-rep by admin
- Monthly budget cap based on attributed revenue: budget = monthlyBudgetPercentOfRevenue × rep's revenue attribution last 30 days (pulled from RevenueAttribution). If a submission would exceed cap, block submission with warning; admin can override.
- Admin > Expenses page: list all, filter by status/rep/partner/market, approve/reject with reason. Bulk approve.
- Partner detail Financial Overview: Total Spent, Revenue Attributed, ROI% (green >0, red <0)
- Rep's own dashboard widget (on Radar): "This month — spent $X of $Y budget / generated $Z"
- Email receipt upon approval or rejection to the rep (transactional — this is an exception to the no-email-notifications rule; expenses are money and deserve email confirmation)

Update STATUS.md and commit.
```

---

### Phase 7 kickoff — AI tone training + message drafting

```
Confirm Phase 6 is complete.

Complete Phase 7 (AI Auto-Followup) per SPEC.md §6.7.

This is the most sensitive phase — the AI must write like the rep, not like a generic chatbot. Invest in the tone extraction.

Build:
- First-login onboarding: if aiToneTrainingStatus = NOT_STARTED, show a modal on dashboard load asking rep to paste 3-5 email samples and 3-5 SMS samples (their own writing to partners or clients). Store as AIToneSample. After submitting, call Claude Haiku with a carefully-crafted prompt to extract tone attributes (formality 1-10, avg sentence length, common greetings, common signoffs, emoji usage frequency, quirks like nicknames or regional phrases, preferred length). Store as ToneProfile JSON on user. Set status to IN_PROGRESS → CALIBRATED.
- "Draft AI Message" button on partner detail. Drawer asks: channel (email/SMS), purpose (First outreach / Follow-up / Schedule meeting / Check-in / Custom), optional context notes. Call Claude Sonnet with system prompt including tone profile + partner context + recent activity + purpose. Show draft; rep edits + sends or regenerates.
- Approval gate counter: each time rep approves (possibly edited) a draft, increment aiAutonomousApprovals. Default threshold is 5 approvals before rep can enable autonomous mode (configurable by admin).
- "Enable AI autonomous sending" toggle in user settings, disabled until threshold met. When rep enables, set aiAutonomousMode = true, log to AuditLog.
- Message templates (admin-managed): CRUD in Admin > Templates. Fields: kind (EMAIL/SMS), name, subject (email), body with {{partner.name}} {{rep.name}} etc. variables, target stage, active toggle.
- Automation cadences (admin-managed): Admin > Cadences. CRUD with trigger stage, steps (each: offset from entry, channel, template, requireApprovalIfBelowThreshold).
- Inngest scheduler: every hour, find partners matching cadence triggers; for each, if rep has autonomous mode, generate message from template in rep's tone and send; else queue a "Message ready for review" notification for the rep with the drafted message.
- SMS consent gate: autonomous SMS blocked unless partner.smsConsent AND contact.smsConsent are true. Partner detail has a checkbox "SMS consent obtained" with required dropdown: method (verbal/written/email), date, gating-rep signature. Store with consent metadata.
- Inbound handling:
  - Twilio SMS webhook at /api/webhooks/twilio/sms: find partner by phone, create Activity(type=SMS_IN), notify rep (in-app + push), never auto-reply
  - STOP keyword handling per Twilio best practices: set contact.smsConsent = false, log
  - Resend inbound email (if configured) or IMAP fallback for the team's inbox: parse replies, create Activity(type=EMAIL_IN), notify rep
- Unsubscribe link footer on every email with one-click unsubscribe endpoint
- Quiet hours enforcement (9pm-8am partner's local time) on autonomous sends
- Rate limits: max 1 autonomous SMS per contact per 72h; max 4 autonomous touches per partner per 14 days (rep can manually override)
- CAN-SPAM physical address in every email footer (pull from Market config)

Comprehensive tests: tone extraction produces sane output on sample data, consent gates block unauthorized sends, quiet hours are respected, approval gate works.

Update STATUS.md and commit.
```

---

### Phase 8 kickoff — Lead scraping + approval queue

```
Confirm Phase 7 is complete.

Complete Phase 8 (Lead scraping + approval queue) per SPEC.md §6.8:

- Scrape source implementations in packages/integrations/scrapers/:
  - GooglePlacesScraper — uses Places API Nearby Search by partnerType → googlePlacesTypes mapping (realtors = "real_estate_agency", insurance = "insurance_agency", etc.)
  - YelpScraper — Fusion API
  - LicensingBoardScraper — start with CO insurance licensee registry and CO real estate commission public data (scrape HTML politely with rate limits; if they offer CSV/API use that). Add KS as second example. Other states as stubs documented for later.
  - CustomUrlScraper — generic HTML scrape via Cheerio with admin-provided selector map
- Normalize all scraped data to a common shape: { companyName, partnerType, contacts:[{name,title,phone,email}], address, city, state, zip, lat, lng, sourceUrl }
- Dedup: hash(normalizedCompanyName + normalizedStreetAddress); compare against existing Partners + prior ScrapedLeads; mark DUPLICATE automatically
- ScrapeJob admin UI (manager+): list, create, edit, pause, "Run now" button. Per-job config: source, market (required), filters (partnerTypes to target, radius), cadence cron.
- Inngest scheduled runner: executes jobs per cadence, writes to ScrapedLead table with status=PENDING
- Approval queue page (/scrape-queue, manager+): left sidebar filters (source, partner type, market, date), table of leads with preview of normalized fields, bulk select checkboxes
- Top bar of queue: Assignment mode dropdown — [Split evenly across reps in this market] / [Assign all to rep X] / [Leave unassigned (first-come-first-served)]
- Bulk "Approve selected" action: creates Partner records at NEW_LEAD stage, assigns per chosen mode, logs to audit. "Reject selected" with optional reason. 
- When assignment mode = "Split evenly", round-robin across active reps in the market (show rep list before confirming)
- Notifications: rep gets in-app notification when new partners land in their queue
- Stats widget for admins: leads scraped / approved / rejected / activated this month by source

Update STATUS.md and commit.
```

---

### Phase 9 kickoff — Hit List + Route Optimization

```
Confirm Phase 8 is complete.

Complete Phase 9 (Hit List + Route Optimization) per SPEC.md §6.9:

- /hit-list page: date picker (default today), "Plan my day" primary button, list of today's current stops (if any), "Re-plan from here" button
- Plan my day flow:
  1. Pull rep's calendar events for the chosen day (internal appointments, Google/Apple external, Storm external). Any with a location become LOCKED stops at their fixed times.
  2. Show rep a list of candidate partners to visit today — sorted by: overdue-for-outreach score, then by distance from start point. Filterable by partner type, stage, assigned-to-me.
  3. Rep selects partners to include (checkboxes). Recommended limit: 8-10 stops.
  4. Rep chooses start mode: Home / Office / Custom address. Pull home/office from user profile.
  5. Submit → Inngest job calls Google Directions API with waypoint optimization, passing locked stops as fixed-time constraints. Algorithm: place locked stops at their fixed times, optimize free stops in remaining windows around them, respect a configurable visit duration (default 20 min) + buffer (default 10 min drive buffer).
  6. Return ordered stops with planned arrival times, distances, durations. Persist as HitList + HitListStop records.
- Hit list execution view: mobile-optimized. Shows next stop as big card (partner name, address, planned arrival, any notes from last visit). Buttons:
  - "Navigate" → platform deep link: iOS opens Apple Maps or Google Maps (user preference in settings), Android opens Google Maps. URL schemes: `maps://?daddr=<addr>` (iOS Apple Maps), `comgooglemaps://?daddr=<addr>` (Google Maps), `geo:0,0?q=<addr>` (Android default)
  - "Mark visited" → prompts for a quick note/outcome (voice or text), logs Activity, moves to next stop
  - "Skip" → prompts reason, logs, moves to next stop
- "Re-plan from here" button: uses rep's current location (request permission on mobile), rebuilds route for remaining stops
- Desktop view of hit list: embedded Google Map with numbered markers + route line, side list of stops
- Daily hit list summary at end of day: stops completed, stops skipped, total drive time, total distance, revenue pipeline touched

Update STATUS.md and commit.
```

---

### Phase 10 kickoff — Reporting

```
Confirm Phase 9 is complete.

Complete Phase 10 (Reporting) per SPEC.md §6.10:

Reports page with left sidebar listing all report types; main area renders selected report with date range picker, filters, and export CSV button (manager+).

Reports to build:
1. Activity report by rep: for date range, per rep: # calls, # emails, # SMS, # visits, # meetings, # stage advancements, # partners activated, $ spent, $ revenue attributed, ROI. Sortable columns.
2. Conversion funnel: waterfall chart showing partner count entering each stage → % advancing to next, by rep / market / partner type. Date range scoped.
3. ROI leaderboard: reps ranked by revenue attributed, cost, ROI. Three sort modes.
4. Scrape performance: leads scraped / approved / rejected / became partners / became activated, by source and market.
5. Partner heatmap: embedded Google Map, markers colored by stage, size by expense, filterable by type + rep. Clickable markers → partner detail in a drawer.
6. Expense breakdown: bar chart by category, drill-down to per-rep / per-partner / per-month.
7. Activity timeline: stacked area chart of activity volume by type over time, filterable by rep.

Plus:
- Scheduled email reports: weekly manager digest (each Monday 8am in their market's timezone), monthly admin summary (first of month 8am). Use Resend. Admin can configure recipients + timing per market.
- CSV export (manager+) on every report.

Update STATUS.md and commit.
```

---

### Phase 11 kickoff — Mobile polish + launch prep

```
Confirm Phase 10 is complete.

Complete Phase 11 (Mobile polish + launch prep) per SPEC.md §6.11:

- App icon (use a stylized "PR" or cloud+radar mark to match Storm's logo family; ask me for final logo; use placeholder otherwise)
- Splash screen
- Dark mode support (both web and mobile)
- Haptics on: stage change, partner activation (balloon-heavy haptic), task complete, appointment reminder
- Pull-to-refresh on lists
- Offline read cache for recently-viewed partners (last 50) via React Query persistence to AsyncStorage
- Push notification setup: Expo Notifications + APNs cert + FCM — for phase 11 set up the delivery pipeline; use dev keys now, ask me for production certs before store submission
- Receipt capture via camera for expenses (use Expo Camera; save direct to R2)
- Voice-note comments: hold to record (Expo Audio), transcribe via Claude Haiku or Whisper, attach both audio file and transcript to partner
- EAS Build configs for TestFlight (iOS) and Play Internal Track (Android)
- App Store + Play Store metadata draft (title, subtitle, description, keywords, screenshots — generate placeholder screenshots from app)
- Final launch checklist document at /LAUNCH_CHECKLIST.md: environment variables, DNS, domain, SSL, monitoring alerts, backup configuration, runbook for common issues
- Load test the web app with 50 concurrent users simulating typical usage; document p50/p95/p99 for key endpoints
- Security review: auth flows, RBAC on every endpoint (automated test), secret management, dependency audit (pnpm audit)

Update STATUS.md. Final commit. Create v1.0.0 git tag.

Tell me what's left for me personally (DNS pointing, App Store account submission, production env vars, etc.) — anything that requires my credentials or decisions.
```

---

## Part 4 — What to do when something goes wrong

**Cowork is stuck on a decision?** It'll ask. Answer in plain English.

**Cowork missed a requirement?** Be specific: *"You didn't implement the SMS consent gate from SPEC.md §6.7. Fix that before we continue."*

**Build is broken?** *"Running `pnpm dev` gives me this error: [paste]. Fix it."*

**A phase is taking too long?** *"Stop here. Update STATUS.md with what's done and what's deferred. We'll pick up the rest later. Move to Phase N+1 foundations only."*

**You want to change scope mid-build?** Edit SPEC.md directly (you can ask Cowork to help) and tell Cowork: *"I've updated SPEC.md §X. Re-read it and adjust."*

**Cowork decided to use a different library than the spec?** *"SPEC.md §1 says we use [X]. You used [Y]. Revert and use [X] unless there's a specific reason [X] won't work — if so, propose the alternative and wait for approval."*

---

## Part 5 — Things you need to do yourself (not Cowork)

1. Get the Storm Cloud API docs when they arrive → hand them to Cowork, ask it to wire up the real integration (replaces the mock in Phase 5)
2. Review and approve AI message templates in Phase 7 — Cowork can draft them but the voice should be yours
3. Decide final pricing/thresholds for expense approval tiers before Phase 6 is deployed to production
4. App Store + Play Store developer accounts ($99/yr Apple, $25 one-time Google) — create these yourself, then hand Cowork credentials for EAS Build
5. Point your domain(s) at Vercel when ready for launch
6. Apple iCloud app-specific passwords for CalDAV integration (you'll generate these yourself)
7. Final branding: logo file, favicon, any custom copy for the login page or email footers

---

That's the whole playbook. Good luck — send me a note through Claude any time you hit a wall.
