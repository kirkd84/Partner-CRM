# PartnerRadar — Assumptions & Engineering Decisions

Running log of decisions Cowork made without Kirk's explicit input. Kirk can correct any of these at any time — we'll amend SPEC.md §10 if a reversal is material.

---

## Stack-level

| # | Decision | Rationale |
|---|---|---|
| 1 | **pnpm 9.x + Turborepo 2.x** | Matches SPEC §1. Pinned via `packageManager` field + `corepack`. |
| 2 | **Node 22 LTS** runtime for Railway container | Current LTS; supported by every dep in SPEC. |
| 3 | **Next.js 15 App Router, standalone output** | Required for Railway container build. Disables Edge features per amendment A001. |
| 4 | **Prisma 5.22+** | Current stable with full Postgres + RLS helpers. |
| 5 | **tRPC v11** | Matches SPEC; v11 has cleaner RSC integration. |
| 6 | **NextAuth v5 (Auth.js)** | Matches SPEC. Credentials provider only in Phase 1; SSO placeholder comment in `auth.ts`. |
| 7 | **Expo SDK 51** | Matches SPEC lower bound. Expo Router v3 for file-based routing. |
| 8 | **Balloon library: `react-confetti-boom`** | Kirk said "don't need extravagant" — `react-confetti-boom` is ~6KB, canvas-based, honors `prefers-reduced-motion`. |
| 9 | **Docker Compose Postgres for local dev** | Documented in README. Developers who prefer can point `DATABASE_URL` at their Railway staging DB. |
| 10 | **CI: GitHub Actions** (lint + typecheck + test on PR; E2E on main) | Matches SPEC §7.9. |

## Product-level

| # | Decision | Rationale |
|---|---|---|
| 11 | **Default markets:** Denver, CO (primary, Wheat Ridge HQ) + Colorado Springs, CO (secondary) | Based on Roof Tech's actual Wheat Ridge address; Kirk can edit in Admin > Markets. |
| 12 | **Default market timezone:** `America/Denver` | Both seeded markets are in MT. |
| 13 | **Tenant config abstraction (`packages/config/src/tenant.ts`)** | Amendment A002 — white-label-ready for sale through Storm Cloud. |
| 14 | **Seed demo users:** `rep@demo.com / manager@demo.com / admin@demo.com` password `Demo1234!` | Matches SPEC kickoff prompt. |
| 15 | **Storm Cloud design parity over Roof Tech brand colors for v1** | Amendment A002 — white-label plan means UI shell stays consistent; only email footer / logo / copy change per tenant. |
| 16 | **Email from-address format:** `PartnerRadar <info@RoofTechnologies.com>` | Uses tenant.ts `fromAddress`. Kirk can change per-market once Resend domain is verified. |
| 17 | **Mobile app bundle ID:** `com.rooftechnologies.partnerradar` (iOS/Android) | Derived from tenant.ts. Kirk reserves in App Store Connect / Play Console when accounts are created. |
| 18 | **Public partner ID format:** `PR-####` (4-digit zero-padded, seeded from 1001) | Matches SPEC §3.7 header format (`PR-1234`). |

## Storm Cloud integration (Phase 5 placeholder)

| # | Decision | Rationale |
|---|---|---|
| 19 | **Mock Storm client writes to `dev-data/storm-mock.json`** | Matches SPEC §6.5. Persists across runs so manual testing is stable. |
| 20 | **Assumed Storm payload shape for `createReferralPartner`:** `{ companyName, address, partnerType, primaryContact: {name, email, phone}, marketCode, externalId: partner.publicId, metadata: { activatedAt, activatedBy, notes } }` | Best guess; `RealStormCloudClient` will have TODO markers for Kirk to correct when real API docs land. |
| 21 | **Assumed webhook event types (stubs):** `partner.revenue_attributed`, `partner.appointment_created`, `partner.project_status_changed` | Plausible shapes based on Storm UI observations. |

## Security / Compliance

| # | Decision | Rationale |
|---|---|---|
| 22 | **`ENCRYPTION_KEY` generated at deploy time** (`openssl rand -base64 32`) stored in Railway env var | AES-256-GCM via `@noble/ciphers` per SPEC §7.7. |
| 23 | **Session expiry: 8h with sliding refresh** | Matches SPEC §7.1. |
| 24 | **Quiet hours: 9pm–8am in partner's local timezone (fallback: market timezone)** | SPEC §7.5 explicit. |

## Phase 4 (Map / Hit List / Prospect Ingestion)

| #  | Decision                                                                                                                                                                                                   | Rationale                                                                                                                                                                  |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25 | **Hit List uniqueness keyed on `(userId, date)` at UTC midnight**                                                                                                                                          | SPEC schema was `@@unique([userId, date])`. Storing UTC midnight keeps the check stable across timezones — "today's list" is unambiguous per calendar day.                 |
| 26 | **Drag-reorder via native HTML5 DnD, not `react-dnd`**                                                                                                                                                     | Kept bundle light + avoided adding another prod dep. Good enough for 10–30 stops; if we ever ship touch DnD on mobile we'll swap.                                          |
| 27 | **`/map` loads Google Maps via `<script>` tag with `libraries=drawing,places&loading=async`**                                                                                                              | Avoids adding `@googlemaps/js-api-loader` as a dep until we have the key. Script tag is dedup'd via `data-google-maps` so re-entering the page doesn't double-insert.      |
| 28 | **Map fallback = pin list, not a disabled map**                                                                                                                                                            | Kirk's rule: degrade gracefully. Without a key the page still tells the rep where partners are + links out to Google Maps search so the workflow isn't blocked.            |
| 29 | **Stage→pin hex colors hard-coded in `MapView.tsx` (`STAGE_PIN_HEX`)**                                                                                                                                     | Google Maps Marker icons want concrete hex; STAGE_COLORS exports Tailwind token names which don't resolve in JS. Table sits next to STAGE_COLORS so drift is one edit away. |
| 30 | **`ScrapeSource` enum expanded with NMLS, STATE_REALTY, STATE_INSURANCE, OVERTURE, CHAMBER, STORM_CLOUD — explicitly excluding ZILLOW and LINKEDIN**                                                        | Per Kirk's 2026-04-23 product direction: Zillow and LinkedIn carry ToS + enforcement risk. Free public sources (NMLS, state boards, Overture) cover 95% of the ICP safely. |
| 31 | **Dedupe hash prefers source-native IDs** (`nmls:<Company_ID>`, future `overture:<place_id>`, etc.) and falls back to `sha1("nz:" + name + "|" + state + "|" + zip)`                                        | Source IDs are authoritative. Name+state+zip fallback tolerates missing IDs without losing dedupe power.                                                                   |
| 32 | **NMLS adapter filters to charter types containing "mortgage"**                                                                                                                                            | Excludes banks / credit unions from the mortgage-broker ICP at ingest time, keeping the prospect queue clean.                                                              |
| 33 | **`packages/integrations/src/ingest/` exposes an `IngestPrismaClient` interface shape rather than importing `@prisma/client`**                                                                             | Lets the package typecheck even when Prisma client isn't generated yet; keeps integrations portable if we ever move ingest jobs to a different runtime.                    |
| 34 | **Prospect queue access is manager+ only (rep role gets a friendly "managers only" card)**                                                                                                                 | Matches the /admin permission pattern; reps shouldn't be creating partner rows bypassing the assignment rules.                                                             |
| 35 | **Approve-from-queue action creates Partner with `source: SCRAPED`, logs `ASSIGNMENT` activity + `APPROVE` audit entry, writes `approvedPartnerId` back onto the ScrapedLead for traceability**            | Every row Kirk sees in the Partners list should be attributable back to its origin; dashboard reports will later roll this up by source.                                   |
| 36 | **`scripts/cowork-push.sh` globs `/sessions/*/mnt/Partner\ CRM/.cowork-secrets` instead of a hard-coded session path**                                                                                      | Session IDs rotate per Cowork run; the old hard-coded `adoring-sharp-wozniak` path broke on every new session. Also honors `$GITHUB_TOKEN` if already exported.            |

## Deferred to later phases (not Phase 1)

- SSO via Storm Cloud — wired placeholder in `auth.ts` comment only
- Apple CalDAV password capture UX — Phase 4
- Licensing-board scraper coverage beyond CO + KS — Phase 8
- Final push cert procurement — Phase 11

## Phase 4 follow-ups still to assume / decide

- Cron runner for weekly scrape jobs — Railway cron vs. GitHub Actions vs. `node-cron` in-app. Leaning Railway cron to keep everything on one platform.
- `created_by` for CLI-run ingests — currently accepts `--created-by <userId>`; may want a dedicated `system@rooftechnologies.com` service user so audit rows always resolve to a real name.
- Apollo vs Clearbit — picking Apollo for v1 per the Phase 4 scope doc, but haven't tested yet; deferring to actual enrichment commit.
