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

## Deferred to later phases (not Phase 1)

- SSO via Storm Cloud — wired placeholder in `auth.ts` comment only
- Apple CalDAV password capture UX — Phase 4
- Licensing-board scraper coverage beyond CO + KS — Phase 8
- Final push cert procurement — Phase 11
