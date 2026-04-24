# PartnerRadar Build Status

Cowork updates this file after every meaningful milestone.

---

## 2026-04-24 pass #10 — ✅ MW-3 core (template catalog + generation pipeline + mobile-first Studio UI)

Lays the whole MW-3 stack end-to-end so a manager+ can type a prompt
and walk away with a rendered, on-brand, editable, downloadable design.
Degrades gracefully without any AI keys — the rule-based director +
Satori/resvg renderer ship real PNGs today; quality climbs as Kirk
plugs in Anthropic and an image-gen provider.

**Template catalog** (`packages/marketing-templates`):

- `h.ts` — tiny Satori-compatible element factory, no React dep.
- `variants.ts` — three color variants per template (light / dark /
  brand-primary) derived from the BrandProfile hexes with WCAG-aware
  contrast picking.
- `lib/common.ts` — shared logoBadge / companyHeader / contactFooter
  - a crude text auto-sizer so long headlines don't overflow.
- 6 production templates registered in the catalog:
  - `flyer-hero-photo-overlay` (Kirk's "Supporting Your Client's
    Property" style), `flyer-typography-forward`,
    `flyer-split-layout-photo`
  - `social-quote-card`, `social-service-highlight`
  - `business-card-classic-horizontal` (300 DPI w/ bleed)
- Each manifest declares slots, sizes (incl. 1080×1080 IG + 1275×1650
  letter + 3.5×2″ BC), required brand fields, and moodTags used by
  the director to match intent to template.

**Generation pipeline** (`packages/marketing-engine`):

- `models/router.ts` — never hardcoded. Routes director to Opus 4.6 /
  Sonnet 4.6 / rule-based based on `ANTHROPIC_API_KEY`. Routes image
  gen to fal.ai / stock / none based on `FAL_API_KEY` + stock keys.
- `pipeline/intent.ts` — rule-based keyword parser + optional Sonnet
  structured-output call. Pulls contentType, tone, audience.
- `pipeline/director.ts` — picks a template (mood-tag match) and
  composes on-brand slot copy. LLM leg is Anthropic Messages; rule
  leg uses purpose → headline transform + brand tagline/industry.
- `pipeline/render.ts` — Satori renders SVG, @resvg/resvg-js rasterizes
  PNG. Fonts fetched once from jsdelivr (Inter 400/600/700/800) and
  cached in process memory.
- `pipeline/adapt-brand.ts` — maps the full BrandProfile down to the
  lean BrandRenderProfile templates consume, keeping marketing-templates
  decoupled from profile evolution.
- `pipeline/generate.ts` — orchestrator returning `{ intent, direction,
templateKey, slots, rendered, elapsedMs }`.

**Studio UI** (mobile-first throughout):

- `/studio/new` — composer with horizontal-scroll content-type pills,
  autoFocus textarea, "ideas to riff on" suggestion chips, sticky
  Generate button. Gracefully blocks when workspace has no ACTIVE
  brand and links to /studio/brands.
- `/studio/designs/[id]` — responsive two-column on lg+, single column
  on mobile. Preview with variant swatches, PNG download, regenerate,
  inline copy editor (debounced autosave), director reasoning card,
  status actions (approve → final → archive).
- `/studio` home — big "New design" CTA in header, Drafts/Approved/
  Archived tabs, 2-col grid on mobile → 4-col on lg. Brand links
  demoted to a compact strip.
- `/api/studio/designs/[id]/png` — renders on-the-fly via Satori+resvg
  so we don't need R2 until MW-5. Caches at the browser (30s).

**Design persistence:**

- `MwDesign.document` JSON = `{ templateKey, slots, variant, sizeKey,
width, height }`. `direction` stores the director's reasoning and
  copy. `MwDesignVersion` records every regenerate + edit with a
  short changeLog.

**Mobile polish across existing surfaces:**

- `TopNav` — labels collapse to icons on phones; nav scrolls horizontally
  with hidden scrollbar; New button becomes icon-only.
- Events detail header — reduced padding, h1 shrinks at sm-, tab row
  gains `overflow-x-auto` so all six tabs stay reachable on a 360px
  viewport.
- Events overview padding shrinks at mobile breakpoints.

**Deps added:**

- `satori@^0.11.2`, `@resvg/resvg-js@^2.6.2` in marketing-engine.
- `@partnerradar/marketing-templates` now a workspace dep of
  marketing-engine.

**Still to ship in MW-3 follow-ups** (not blocking user value):

- 29 more templates (10 social, 4 brochure, 3 business card, 12 flyer).
- Stock photo search (Pexels + Unsplash adapters behind the router).
- Image gen via fal.ai once Kirk adds `FAL_API_KEY`.
- Background removal + upscaling (integrations/image-ops).
- Print PDF export with CMYK + bleed + crop marks (currently PNG only).

---

## 2026-04-24 pass #9 — ✅ MW-2 polish (BrandPreview component)

Closes out MW-2's "3 sample designs" review step from SPEC_MARKETING
§3.1 and lays the first MW-3 template primitive.

**New surface:**

- `packages/marketing-ui/src/BrandPreview.tsx` — pure SVG + React
  component that takes a `BrandProfile` and renders one of three
  sample variants (`flyer`, `social`, `email-header`). No Satori,
  no server calls, zero latency. Colors, typography, headline case,
  footer address all pull directly from the profile.
- `/studio/brands` — every row now shows a 72px social preview tile
  so admins can glance at the brand palette in-place.
- `/studio/brand-setup` — adds a sticky right-rail live preview
  (flyer + social + email-header) that updates as the admin tweaks
  colors, fonts, or company name. Submits without a round-trip.
- `@partnerradar/marketing-ui` now depends on `marketing-engine`
  for the `BrandProfile` type + `placeholderBrandProfile` helper.
  Preserves the extraction contract: `marketing-ui` still has no
  PartnerRadar-internal peer deps.

Why it matters: Kirk can now see a brand before committing, and
MW-3 template registry already has its first working template.

---

## 2026-04-24 pass #8 — ✅ MW-2 foundation (brand training data + CRUD)

First Marketing Wizard phase to leave the scaffold stage. The data
model and admin surfaces are live; the full Claude-vision extraction
pipeline lands in a dedicated session once ANTHROPIC_API_KEY and R2
storage are wired.

**New surface:**

- `packages/marketing-engine/src/brand/types.ts` — `BrandProfile`
  TypeScript shape matching SPEC_MARKETING §3.2 (identity + logos +
  colors + typography + layout motifs + voice + training samples +
  preference weights). `placeholderBrandProfile()` seeds a usable
  profile from explicit admin inputs when AI extraction is off.
- `packages/marketing-engine/src/brand/extract.ts` —
  `extractBrandProfile()` entry point. Graceful without
  `ANTHROPIC_API_KEY` (returns the placeholder with a note); never
  throws so the UI can always move forward. Anthropic SDK + vision
  prompt wiring deferred.
- `/studio/brands` — manager+ list grouped by workspace, with color
  swatches, status pills (TRAINING / ACTIVE / ARCHIVED), and admin
  controls for approve, set-default, archive.
- `/studio/brand-setup?workspaceId=…` — admin-only new-brand form
  with identity + colors + voice descriptors + dos/don'ts. Seeds
  from tenant defaults (Roof Tech's orange / navy / cyan) so Kirk
  doesn't retype. Sample-upload step is surfaced as a "coming soon"
  banner pending R2.
- `brand-actions.ts` — `createBrand`, `approveBrand`, `archiveBrand`,
  `setDefaultBrand`, `loadBrandProfile`. All mutations write
  `AuditLog` rows.
- `/studio` landing page now has a Brands card with direct links.

**Unblocks:**

- MW-3 template catalog (needs an ACTIVE BrandProfile to render
  variants from).
- EV-10 Marketing Wizard event integration (needs a brand to source
  colors + typography for event invite designs).

**Still deferred for MW-2 completeness:**

- Claude Opus 4.7 vision-based extraction (structured-output prompt
  - parser) — needs ANTHROPIC_API_KEY.
- R2-backed sample upload — needs Cloudflare R2 credentials.
- 3 auto-generated sample designs in the review step — needs MW-3
  template primitives.

---

## 2026-04-24 pass #7 — ✅ EV-11 web slice (share link + check-in haptics)

Full EV-11 is a native mobile rebuild + Expo push notifications that
deserves its own session. This pass ships the web-side pieces that
deliver the most immediate value:

**Shareable read-only event view** (SPEC_EVENTS §13):

- New `/share/[token]` public page — schedule, hosts, ticket counts,
  confirmed guest list (names only — no emails, phones, or RSVP
  tokens leak). Organizer hands the URL to the venue contact,
  caterer, or AV vendor.
- `EvEvent.shareToken` field (nullable, unique) + auto-migrate DDL.
  Lazy-generated via `ensureShareToken` server action the first time
  the organizer clicks Share.
- Event header now has Share / Check-in / Cancel pills. Share popup
  has copy-to-clipboard + rotate + disable controls.
- Rotations + disables log to `EvActivityLogEntry` so there's an
  audit trail of who shared what when.

**Check-in haptics + sound** (SPEC_EVENTS §13 / EV-11):

- Successful scan fires `navigator.vibrate(40)` on mobile + a short
  WebAudio sine "bloop" at 880 Hz. Warn and err states get their own
  vibration patterns (pulse, long).
- Sound toggle in the check-in header (Volume2 / VolumeX icon);
  preference persists via `localStorage` so hosts don't re-toggle
  every time.
- No audio file fetch, no external lib — pure WebAudio, ~40 lines.

**Deferred** (needs its own session):

- Full `apps/mobile` Event screens (React Native / Expo)
- Expo push notifications (Expo credentials + server push)
- Service-worker web push (VAPID keys still pending from Kirk)

---

## 2026-04-24 pass #6 — ✅ EV-9 (analytics + per-partner history + reliability report)

**New surface:**

- Event detail Dashboard tab now renders a real dashboard instead of
  the placeholder — funnel cards (Invited → Accepted → Confirmed →
  Attended with conversion %), response-time histogram buckets
  (<1h / 1-6h / 6-24h / 1-3d / >3d), message performance table per
  reminder kind (scheduled / sent / canceled / failed), cost
  estimate (SMS + email + flat staff hours), and ticket utilization
  table.
- `lib/events/analytics.ts` — `computeEventAnalytics(eventId)` and
  `partnerEventHistory(partnerId)` aggregators; single place to
  compute all of the above.
- `/api/events/[id]/export?view=funnel|invites|attendance` — CSV
  download route (manager+/host/creator) with three views.
- `/events?tab=past` now renders a rich table: invited / confirmed /
  attended counts + 90-day revenue (from RevenueAttribution on
  attended partners) + ROI ratio. Placeholder cost model until real
  Twilio/Resend billing plugs in.
- Partner detail page gains a server-rendered Event history card at
  the bottom with acceptance/show/score chips + table of every invite
  this partner has received, linked back to its event.
- Admin → **Partner reliability** (new nav item) — ranked list of
  partners by `reliabilityScore`, filterable by market + min show
  rate + eligibility. Admins can bulk-flip `autoWaitlistEligible`;
  managers get read-only. CSV export at
  `/api/admin/reliability/export`.

**Remaining on the Event Tracking spec:**

- EV-10 Marketing Wizard integration (design-from-event, post-event
  thank-you campaign) — blocked on MW-2..6 shipping first.
- EV-11 mobile polish + push notifs.

---

## 2026-04-24 pass #5 — ✅ EV-8 (mobile check-in UI + attendance postmortem)

**New surface:**

- `/events/[id]/check-in` mobile-first host page. Sticky header shows
  `X/Y` primary-ticket check-in count in real time. Three modes:
  - **List** — searchable attendee cards with per-ticket tap-to-
    check-in buttons + big primary check-in button.
  - **Scan** — fullscreen `html5-qrcode` camera viewfinder. On decode,
    verifies the HMAC ticket token server-side and marks the
    assignment checkedIn. Debounced repeat scans; graceful fallback
    when camera is denied.
  - **Walk-in** — bottom-sheet drawer: name + optional email/phone +
    ticket selector + soft capacity check with override checkbox.
    Creates an AD_HOC EvInvite with status CONFIRMED and immediately
    marks every assignment checked in.
- `check-in-actions.ts` server actions: `scanCheckIn`, `manualCheckIn`,
  `walkInAdd`, `undoCheckIn`. Auth matches event detail permissions.
  Idempotent — re-scanning a checked-in ticket returns `already`.
- `EventHeaderActions` now shows a prominent "Check-in" pill for
  anyone who can edit the event.
- `html5-qrcode@^2.3.8` added; dynamically imported in the client so
  hosts who never scan don't pay the bundle cost.
- `lib/jobs/event-attendance.ts` — new Inngest cron (10m) that:
  - Picks up events that ended >24h ago and aren't yet COMPLETED.
  - Marks CONFIRMED invites without a primary check-in as NO_SHOW.
  - Logs Partner `Activity` rows (EVENT_ATTENDED, EVENT_NO_SHOW,
    EVENT_WALKED_IN) keyed to eventId in metadata so we never
    double-log.
  - Recomputes Partner reliability: 90-day
    `eventAcceptanceRate`, `eventShowRate`, composite
    `reliabilityScore`.
  - Emails host + creator a plain-English attendance summary.
  - Flips event status to COMPLETED so it never re-reconciles.
- Schema: Partner now carries `eventAcceptanceRate`, `eventShowRate`,
  `reliabilityScore` (all nullable floats); ActivityType enum gains
  `EVENT_ATTENDED`, `EVENT_NO_SHOW`, `EVENT_WALKED_IN`. Mirrored in
  auto-migrate DDL via `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.

**Remaining on the Event Tracking spec:**

- EV-9 analytics + per-partner history dashboards
- EV-10 Marketing Wizard integration on events
- EV-11 mobile polish + push notifs

---

## 2026-04-24 pass #4 — ✅ EV-7 (day-before + arrival reminders with QR codes)

EV-7 layered on top of EV-5's reminder scheduler. The DAY_BEFORE and
ARRIVAL_DETAILS rows were already getting written at RSVP time; this
pass made them actually useful to the invitee on event day.

**New surface:**

- `apps/web/src/lib/events/qr.ts` — HMAC-signed ticket tokens + PNG
  QR rendering (qrcode npm). Tokens encode `{ assignmentId, inviteId,
ticketTypeId, iat }` signed with a per-event derived secret, so a
  leaked token for one event can't forge one on another.
- `GET /api/events/[id]/qr/[assignmentId]?token=…` — returns a 200px
  PNG. Auth is either the signed token (for email inline images) or a
  logged-in organizer/host. The route re-signs tokens on the fly so
  reassignments via hand-assign / batch-offer claim stay consistent.
- `/arrival?token=<rsvpToken>` public page — venue map (Google Static
  Maps, key-gated with plain-address fallback), per-ticket QR codes
  inline, plus-one name, host chips with tap-to-call / email.
- DAY_BEFORE + ARRIVAL_DETAILS emails upgraded — both now embed QR
  images (served through the new API route) + CTA to the /arrival
  page; ARRIVAL copy includes the tickets list.
- SETUP_T_MINUS_4H + SETUP_T_MINUS_1H host reminders. New
  `regenerateSubEventSetupReminders(subEventId)` helper that writes
  rows at T-4h and T-1h when a sub-event of `kind=SETUP` is created.
  Wired into `createSubEvent` + `deleteSubEvent` (cancels pending on
  delete). Dispatcher emails every host on the event with location +
  notes.
- Middleware now allows `/arrival` and `/api/events/*/qr/*` through
  unauthenticated.
- `qrcode@^1.5.4` + `@types/qrcode` added to apps/web.

**Token safety:** per-event secret = HMAC(NEXTAUTH_SECRET,
`event:<id>`). Timing-safe compare on verify. No token store —
tokens are self-contained, and we cross-check the assignment row in
one DB hit at scan time.

Next up: EV-8 (mobile check-in UI with QR scanner, walk-in add,
offline queue, post-event attendance postmortem).

---

## 2026-04-24 pass #3 — ✅ EV-6 (cascade engine + batch-offer parking race)

With EV-1..5 live and the Dockerfile fix deployed, the next logic-
dense piece landed: the full cascade engine that handles what happens
when a ticket is released (decline / cancel / expire / partial drop).

**New surface:**

- `apps/web/src/lib/events/cascade.ts` — single source of truth.
  `handleTicketRelease(eventId, ticketTypeIds[])` → `{ promoted,
batchOffered, unfilled }`.
  - PRIMARY release → promote next QUEUED invite with proximity-aware
    expiresAt; dispatch automatically.
  - DEPENDENT release → create EvBatchOffer with unique claim tokens
    per eligible confirmed invitee; fire SMS + email blast in parallel.
- `apps/web/src/lib/events/dispatch-batch-offer.ts` — parallel fan-out
  email (Resend) + SMS (Twilio dry-run) with per-recipient unique
  claim URLs.
- `/claim/[token]` public page — single tap "Claim it" button. Atomic
  race via `SELECT ... FOR UPDATE` on the batch-offer header row
  inside a $transaction. First arriver wins; losers see a friendly
  miss page with an "Add me to future offers" opt-in.
- `EvBatchOffer` + `EvBatchOfferRecipient` tables + idempotent DDL in
  `instrumentation.ts` (auto-migrate on Railway boot).
- Organizer-side batch-offers card on the event Overview tab — shows
  active offers with expiry countdowns, cancel button, and recent
  history (won-by-name, expired, canceled).
- `/api/admin/batch-offer-stress` — diagnostic route that fires N
  concurrent claims against a single batch offer and asserts exactly
  one winner. Admin-only.
- `batch-offer-actions.ts` — organizer `cancelBatchOffer` +
  `handAssignBatchOffer` (hand-assign short-circuits the race).

**Race safety design:** the recipient row's `claimToken` is a 192-bit
random base64url value. Inside a single Postgres transaction we
`FOR UPDATE OF o` the shared `EvBatchOffer` header, short-circuit if
it's already CLAIMED/EXPIRED/CANCELED, re-verify capacity, then
conditional-update to CLAIMED + insert/upsert the winning assignment.
Lazy-expires stale OPEN offers on contact; a 5-min Inngest tick also
bulk-expires them. Losing recipients get their row stamped
`lostRaceAt` immediately, so reporting can show click-vs-win rate.

**Middleware** now allows `/claim` through unauthenticated like
`/rsvp` and `/unsubscribe`.

Next up: EV-7 (day-before + arrival reminders with QR codes) — the
reminder schedule already writes DAY_BEFORE + ARRIVAL_DETAILS rows;
EV-7 wires up QR generation and the actual send path.

---

## 2026-04-24 (pivot — Kirk's second "all night") — ✅ Event Tracking EV-1..4 + Marketing Wizard MW-1

After the Phase 8 automation push, Kirk dropped two new specs
(SPEC_EVENTS.md, SPEC_MARKETING.md) and said "Pivot time. Do as much
as you can tonight." One monster commit covers all four early Event
Tracking phases + the Marketing Wizard foundation.

| Commit  | Scope                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------- |
| 880e064 | EV-1..4 (Events: schema + /events shell + detail + hosts/sub-events + invite queue + batch send + public RSVP + ICS) |
|         | MW-1 (Marketing Wizard: 12 Mw\* tables + 5 package scaffolds + /studio embedded shell + auto-workspace provision)    |

**Event Tracking — what works end-to-end today:**

- Create an event at `/events` with a primary ticket. Permission-
  scoped per SPEC §12 (reps see their hosted-or-created events,
  managers see markets, admins see all).
- Add dependent ticket types (Dinner, Parking) from the Overview tab.
- Add hosts with per-ticket consumption — their tickets auto-confirm,
  eating into capacity immediately.
- Add sub-events (Setup / Pre-Event / Dinner / Teardown) with
  invitation-scope options (INTERNAL_ONLY / ALL_CONFIRMED /
  DEPENDENT_TICKET_HOLDERS / CUSTOM).
- Queue partners (multi-select with search) + ad-hoc invitees (name
  - email/phone). Toggle plus-ones per row. Drag to reorder.
- "Send batch" fires a proximity-aware response window (§2.5) and
  dispatches email invites via Resend (SMS dry-runs without Twilio).
- Public `/rsvp/[token]` — no login, mobile-first. Accept, decline,
  accept-with-changes (partial drop), quick-confirm (cascade stage),
  cancel with reason. Add-to-calendar buttons for Google + ICS.
- On decline/cancel/expire, Inngest `event.ticket-released` event
  fires; cascade worker promotes next QUEUED invite with compressed
  response window. `event-expire-tick` cron (every 5 min) flips stale
  SENT → EXPIRED.

**Marketing Wizard — what's there today:**

- 12 `Mw*` tables seeded through auto-migrate, every market gets an
  auto-provisioned workspace with plan=EMBEDDED.
- /studio placeholder page (manager+ gate) shows the caller's
  workspace, member count, brand/design counts, and a roadmap to MW-2
  (brand training), MW-3 (template catalog), MW-4+ (publish + print).
- `packages/marketing-{api,ui,engine,templates,billing}` scaffolded
  with extraction-safe architecture. `MARKETING_MODE=embedded|standalone`
  env flag is the single switch for the future split.

**Still to ship per EV spec:**

- EV-5 confirmation cascade reminders (T-5d re-confirm → nudge → auto-cancel)
- EV-6 batch-offer for freed dependent tickets (the parking scenario)
- EV-7 day-before + arrival details reminders with QR codes
- EV-8 mobile `/check-in` UI with QR scanner + walk-in add
- EV-9 analytics (funnel, per-partner history, ROI leaderboard)
- EV-10 Marketing Wizard integration on events (design-from-event)
- EV-11 mobile polish + push notifs

**Config:** `QUIET_HOURS_START/END` (defaults 8/20) drives the
consent module; `MARKETING_MODE` defaults to `embedded`.

---

## 2026-04-24 (overnight pass) — ✅ Phase 8 automation, reports, compliance

Kirk said "cram as much as you can — I am going home, you have all
night!" Everything below shipped as atomic commits to `main` between
evening and morning. All graceful-without-creds: drop the right env
var on Railway and the feature lights up with no code change.

| Commit  | Scope                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2f16629 | `/admin/budget-rules` + `/admin/templates` + `/admin/cadences` CRUD (with variable substitution tests, step editor, execution settings)    |
| b002072 | Radar financial pulse strip (Spent MTD / Budget / Revenue MTD with progress bar + over-budget banner) + Storm 6-hour revenue sync          |
| d79be24 | `/reports` rebuilt with Activity / Funnel / ROI / Expenses tabs + URL-driven range picker (7d/30d/90d/YTD); Resend expense emails          |
| eb4a98c | AI tone training first-login modal + /settings retrain card. Samples persist even if `ANTHROPIC_API_KEY` is missing                        |
| 4593f5d | Cadence automation wired end-to-end: consent + quiet hours + dispatcher + Inngest enrollment on stage change + 5-min dispatch cron         |
| 3c2094f | Seed 5 message templates + 3 starter cadences on first boot (only when tables empty); execution stats pills on /admin/cadences             |
| f97c405 | CAN-SPAM compliance: HMAC-signed /unsubscribe + RFC 8058 one-click POST + List-Unsubscribe headers + legal footer on every automated email |
| f43ce06 | `/admin/cadence-queue` — approve-and-send or drop cadence steps marked requireApproval, with audit log                                     |

**What this means practically — flip these env vars and the whole
automation stack comes alive:**

1. Add `RESEND_API_KEY` + `RESEND_FROM_EMAIL` → expense approval
   emails + cadence email sends start going out.
2. Add `ANTHROPIC_API_KEY` → rep tone extraction + AI draft drawer
   start using Haiku 4.5 / Sonnet 4.6.
3. Add Inngest signing keys → 6-hour Storm revenue sync + 5-minute
   cadence dispatch start firing.
4. Add `TWILIO_AUTH_TOKEN` (Phase 8.1 still) → cadence SMS sends
   light up. Today they dry-run with a clear "twilio_not_configured"
   outcome.

**New surfaces Kirk can click through this morning:**

- `/admin/budget-rules` — tenant-wide default auto-seeded; add
  per-market or per-rep overrides.
- `/admin/templates` — 5 canonical templates pre-seeded. Variable
  palette + live preview + SMS char meter.
- `/admin/cadences` — 3 cadences pre-seeded. Step editor with offset
  presets, per-step approval toggle, timeline preview. Per-row
  execution pills (scheduled / sent / blocked / pending).
- `/admin/cadence-queue` — any step marked "requires approval" lands
  here with Approve & Send or Drop buttons.
- `/reports` — four tabs with real data. Works with zero data shown
  gracefully; lights up as activity accumulates.
- `/settings` right column — "AI tone" card shows status + summary
  - Retrain button. First-login modal still triggers for fresh REPs.
- `/unsubscribe` — public, no-auth. One-click kill for any emailed
  contact. Audit-logged.

**Compliance note (CAN-SPAM §7.5):** every automated email now ships
with the tenant legal name + physical address + a working unsubscribe
link. `List-Unsubscribe` and `List-Unsubscribe-Post` headers mean
Gmail / Apple Mail render their native unsubscribe button. One-click
unsubscribe flips `Contact.emailConsent=false` when the last
subscribed address is removed.

**Schema touch-ups that auto-applied:** none — everything above reused
existing tables. `instrumentation.ts` only added idempotent data
seeding (no DDL), so the deploy came up clean.

---

## 2026-04-23 (autonomous pass #2) — 🚧 Phase 4 foundations landed

Kirk fired a 4-hour autonomous build on top of the freshly-shipped
Phase 2+3 baseline. Four Phase 4 scaffolds landed as atomic commits:

| Commit  | Scope                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 6428685 | Hit Lists CRUD — /lists hub (card grid), /lists/[id] detail with drag-reorder + per-stop complete, "+ New hit list" drawer    |
| c7c03c5 | /map page with graceful Google Maps degradation — renders pins when `GOOGLE_MAPS_API_KEY` is set, fallback pin list otherwise |
| d803180 | Prospect queue — /admin/scraped-leads with approve→Partner / reject-with-reason; ScrapeSource enum expanded to 10 values      |
| d2fd938 | NMLS ingestion adapter (streaming CSV) + generic `runIngest` pipeline + `scripts/ingest-nmls.ts` CLI                          |

**What this means practically:**

- Every rep can now plan a day: open /lists, hit "+ New", drop
  partners onto the list, drag to reorder, check off as they visit
  (each check-in writes a VISIT activity to the partner).
- /map works _today_ as a pin list — the moment Kirk drops a Google
  Maps key on Railway it upgrades to full interactive pins with a
  side detail rail. Drawing + Places libs are already requested in
  the loader.
- The ingestion pipeline end-to-end: NMLS adapter (or any future
  adapter) emits `ProspectCandidate` rows → base runner dedupes
  against `ScrapedLead.dedupHash` → human approver hits /admin/
  scraped-leads → one click becomes a Partner in NEW_LEAD stage with
  a full audit trail.

**Phase 4 items still to land:**

1. Google Maps key provisioning (blocked on Kirk).
2. Territory lasso + "In this area" / "Prospects in this area"
   panels on /map (unlocks with the key).
3. State licensing-board adapters (CO DORA, KS KREC, CO/KS insurance
   depts). Same pipeline as NMLS, different parsers.
4. Overture Maps loader + Google Places live-refresh fallback.
5. Cron wiring for weekly runs (Railway cron or GitHub Actions).
6. Apollo enrichment on Partner promotion (blocked on `APOLLO_API_KEY`).
7. Routing deep-links + per-stop driving order.

**⚠️ DB migration note:**
Auto-migrate was reverted in `7b46bc6` because the Dockerfile change
was unstable. Commit `d803180` added new `ScrapeSource` enum values
(NMLS, STATE_REALTY, STATE_INSURANCE, OVERTURE, CHAMBER,
STORM_CLOUD). Run once against the Railway Postgres to pick them up:

```
pnpm --filter @partnerradar/db exec prisma db push
```

The existing /admin/scraped-leads page won't crash without this
migration — it only filters on status (no new values there). But the
NMLS ingestion CLI (`scripts/ingest-nmls.ts`) _will_ fail until the
enum is synced, because it writes `source: 'NMLS'` to ScrapeJob.

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

## 📍 Next up — Phase 4 (Map, Hit List, Routes, Territory Lasso, Prospect Ingestion)

Phase 4 is the mobile-first tour planner + the territory prospecting
tool. Scope expanded on 2026-04-23 per Kirk's product direction.

### Base map + routing (SPEC §6.4)

- `/map` page — interactive Google Maps with partner pins colored by
  stage, bounded by the user's active markets.
- Hit List builder — save curated lists of partners to visit;
  drag-reorder; TSP-ish optimize.
- Routes — given a start (HOME / OFFICE / LAST_STOP / CUSTOM) and a
  hit list, generate a driving order, deep-link to Google/Apple Maps.
- Appointments linked to routes ("stops") so the visit auto-logs a
  check-in when a rep starts navigation.

### Territory lasso (NEW — Kirk's ask)

Sales managers draw a polygon (or circle / rectangle) on the map via
the Google Maps Drawing library. Two panels surface side-by-side:

1. **In this area (existing)** — every Partner we already track whose
   lat/lng falls inside the polygon, dedupe-safe, one-click jump to
   detail.
2. **Prospects in this area** — businesses we don't yet have, drawn
   from the prospect ingestion pipeline below. Each row has "+ Add as
   partner" and "+ Add to hit list" buttons. Dedupe against existing
   Partners by name + normalized address.

Polygon results are cached in `ScrapedLead` with a 14–30 day TTL keyed
by `(polygonGeohash, icpType)` so the same manager re-lassoing the
same area tomorrow is free. Save-as-territory lets managers name
polygons (e.g. "Wheat Ridge corridor") and pin them to the market.

### Prospect ingestion pipeline (NEW — legal, free sources first)

Decision made 2026-04-23: **no Zillow / LinkedIn scraping** — ToS
risk, active enforcement, and the free alternatives cover most of
what we need. Instead we build our own ingestion jobs against public
data. Each feeds the `ScrapedLead` table with dedupe logic.

Source priority:

1. **NMLS Consumer Access** (federal, free) — every licensed mortgage
   broker + loan officer in the US. Bulk download, weekly refresh.
   Covers ~100% of the mortgage-broker ICP.
2. **State real estate commissions** — CO DORA, KS KREC first
   (Kirk's active markets). Per-state adapter, weekly refresh. Covers
   realtor + broker licensees.
3. **State insurance department producer databases** — CO Division of
   Insurance, KS Department of Insurance first. Covers insurance
   agents.
4. **Overture Maps** (open data from Microsoft/Meta/Amazon/TomTom, no
   license fee) — 60M+ global places with category tags. Used to fill
   gaps for general-contractor / HVAC / plumbing / landscaping /
   restoration ICPs.
5. **Chamber of Commerce member directories** — per-chamber scraper,
   rate-limited, respect robots.txt. Nice-to-have, not a hard dep.
6. **Google Places Nearby Search** — the live-refresh layer on top of
   1–5. Hit when a lasso draws somewhere we haven't seeded yet.
   Cached aggressively.
7. **Storm Cloud historical touchpoints** (parking-lot — pending Storm
   dev team exposing an endpoint) — partners who've already referred
   projects into Storm. If we get this, it's the moat.

### Enrichment

When a prospect is promoted to Partner, we enrich the contact card via
a paid B2B API (Apollo or Clearbit — $50–200/mo) to pull
decision-maker name, email, phone, LinkedIn URL. This replaces any
temptation to scrape LinkedIn directly. Apollo gets the shortlist for
v1 based on their roofing-industry coverage.

### Blocked on Kirk (creds needed)

- `GOOGLE_MAPS_API_KEY` with Maps JS + Drawing + Places + Directions
  enabled → base map, lasso, prospect search, address autocomplete.
- `APOLLO_API_KEY` (or Clearbit equivalent) → enrichment on prospect →
  partner promotion. Optional for Phase 4 ship; degrades to manual.
- Storm Cloud decision — does Storm have a market-prospects / past-
  referrer feed we could consume? If yes, adds a source #7. If no,
  sources 1–6 still ship.
- `RESEND_API_KEY` + DKIM/SPF on `rooftechnologies.com` — Phase 3
  invite magic-links. Not Phase 4 blocking.
- `R2_*` Cloudflare bucket — Phase 2 file uploads. Not Phase 4
  blocking.
- `ANTHROPIC_API_KEY` → Phase 7 AI Follow-ups.
- `TWILIO_*` → Phase 7 SMS outbound.

Without Maps key: the map page renders a static marker list and the
lasso becomes a city/ZIP picker. Base routing still works. Ingestion
jobs run independent of the map key.

### Phase 4 build order when we kick off

1. Google Maps wrapper component + partner pins from DB (1 day)
2. Hit List CRUD + drag-reorder + TSP-ish optimize (1 day)
3. Routes + deep-link to Google/Apple Maps (1 day)
4. Lasso drawing tool + "in this area (existing partners)" panel (1 day)
5. NMLS + CO realtor + KS realtor + CO insurance ingestion jobs with
   `ScrapedLead` writes + weekly cron (2 days)
6. Overture Maps loader for commercial ICPs (0.5 day)
7. Google Places live-refresh fallback + polygon cache (1 day)
8. "Prospects in this area" panel + dedupe + "Add as partner" /
   "Add to hit list" buttons (1 day)
9. Save-as-territory + named polygons per market (0.5 day)
10. Apollo enrichment on promotion (0.5 day, gated on key)

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
