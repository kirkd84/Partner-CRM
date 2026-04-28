# Security model

What PartnerRadar is protecting, what controls are in place, what's explicitly out of scope, and how to report a vulnerability.

## What we're protecting

PartnerRadar holds first-party data for a CRM:

- **Partner records** — company name, address, website, phone, primary contact name + title + email + phone. Not regulated PII at the level of HIPAA / PCI, but absolutely not data Roof Tech wants leaked to a competitor's pipeline.
- **User credentials** — bcrypt-hashed passwords in `User.passwordHash`. Sessions issued by NextAuth.
- **Activity history** — every interaction, drop-by, call, and email logged against a partner. Reveals sales tactics + relationships.
- **Storm Cloud integration tokens** — when wired, AES-256-GCM encrypted at rest with `ENCRYPTION_KEY`.
- **Marketing brand assets** — logos, color palettes, contact info that ship in customer-facing flyers.
- **Aggregated metrics** — show rates, reliability scores, conversion data per partner.

## What we're NOT protecting against

Be honest about scope:

- **Insider threats with admin access.** An admin can export every partner, change roles, and see every audit entry. The audit log records what they did, but it doesn't stop them.
- **A determined attacker with the Postgres URL.** Database-level encryption-at-rest is Railway's responsibility; we don't add an application-layer cipher on top of partner records.
- **Targeted phishing of Roof Tech reps.** No FIDO2 / WebAuthn / hardware keys. A rep who hands their password to a phishing page hands the attacker their book.
- **Side-channel attacks on the rendering pipeline.** PNG / PDF generation runs on the same dyno as everything else; a bug there could in principle leak memory.
- **DoS at scale.** Rate limits are per-IP/per-user; an attacker with a botnet can still make the app unpleasant.

## Authentication

| Control          | Implementation                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password storage | bcrypt (`bcryptjs@^2.4.3`), default 10 rounds.                                                                                                                                                                                                                                  |
| Session cookies  | HttpOnly, Secure-in-prod, SameSite=Lax via NextAuth v5 defaults.                                                                                                                                                                                                                |
| Session secret   | `NEXTAUTH_SECRET` env var; rotate by changing the value (existing sessions invalidate).                                                                                                                                                                                         |
| Edge middleware  | All routes auth-required by default. Public exceptions: `/login`, `/rsvp/:token`, `/share/:token`, `/claim/:token`, `/arrival/:token`, `/api/unsubscribe`, `/api/webhooks/*`, `/api/inngest`, `/api/auth/google`, ICS feeds, `/api/health`, `/api/cron/scrape-tick` (own auth). |
| OAuth providers  | Google / Azure / Apple supported via NextAuth, gated on env vars. Off by default.                                                                                                                                                                                               |
| Login rate limit | 20/min per IP, 5/5min per (IP,email). Returns `null` (same UX as wrong password) so an attacker can't tell they hit a limit.                                                                                                                                                    |

### Public token endpoints

`/rsvp/:token`, `/share/:token`, `/claim/:token`, `/arrival/:token` — each carries an opaque token bound to a specific row. Tokens are random 24-byte hex strings, single-use where applicable, and expire with their parent record (event ends → arrival tokens stop accepting). Unsubscribe tokens are HMAC-signed to prevent forgery.

## Authorization

Four-role RBAC:

| Role            | Sees                                                               | Mutates                                                                                                |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **REP**         | Partners assigned to them OR unassigned in their tenant's markets. | Their own activity logs. Cannot bulk-export. Cannot lasso-scrape (cost). Cannot configure scrape jobs. |
| **MANAGER**     | Partners + activity in their tenant's markets they're assigned to. | Same. Can invite reps. Can configure scrape jobs in their markets.                                     |
| **ADMIN**       | Everything in their tenant.                                        | Everything in their tenant.                                                                            |
| **SUPER_ADMIN** | Cross-tenant operator (Copayee). Can act-as any tenant.            | Tenant lifecycle (create / suspend / cancel) + all operations within the tenant they're acting-as.     |

The check pattern is consistent: `assertManagerInMarket(marketId)` for market-scoped writes, `session.user.role !== 'ADMIN'` for admin-only actions, `session.user.markets.includes(...)` for cross-market reads. Server actions all start with the role check before any DB read so a forged form post can't escalate.

**Multi-tenant scoping**: `lib/tenant/context.ts` exports `activeTenantId(session)`, `tenantWhere(session)`, `marketTenantWhere(session)`, `requireSuperAdmin(session)`, `assertTenantAccess(session, id)`, and `assertWorkspaceTenant(session, ws.tenantId)`. Every query that touches tenant-scoped data must call one of these. SUPER_ADMINs use an HttpOnly `pr-act-as-tenant` cookie set via /super-admin to scope into a tenant temporarily; the cookie is ignored for regular users (a tenant employee can't escape their tenant by setting it). Every act-as transition is audit-logged. See `MULTI-TENANT.md` for the threat model + remaining retrofit work.

## Input validation

Every server action and API route validates input with Zod schemas from `@partnerradar/types`. Prisma is the only DB layer; queries are parameterized. Two `$queryRawUnsafe` callsites exist (in `instrumentation.ts` for migrations, in `/admin/state-boards/page.tsx` for the import-history aggregation) — both use `$1` parameter binding, not string interpolation.

## HTTP transport

| Header                      | Value                                                    | Why                                                          |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains`                    | Force HTTPS for 6 months.                                    |
| `X-Frame-Options`           | `DENY` (`SAMEORIGIN` for `/rsvp /share /claim /arrival`) | Block clickjacking.                                          |
| `X-Content-Type-Options`    | `nosniff`                                                | Stop the browser from executing a CSV download as JS.        |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                        | Keep partner-ID URLs out of third-party referrers.           |
| `Permissions-Policy`        | `camera=() microphone=() geolocation=(self)`             | Lock down feature access; only enable what we need.          |
| `Content-Security-Policy`   | See `next.config.ts`                                     | Allow-list for scripts, images, fonts, network destinations. |

`Strict-Transport-Security` is conservative (no preload); flip preload on once HTTPS is committed across every subdomain.

## Audit logging

Every mutation that touches PII or compliance writes an `AuditLog` row with `userId`, `action`, `entityType`, `entityId`, `metadata`. Coverage as of latest:

- Partner create / update / archive / activate / assign
- Stage changes
- Activity log entries
- Settings changes
- User invite / role change / market assignment / deactivation
- Brand profile create / update
- Design create / regenerate / approve / archive / refine
- Event create / update / cancel
- Cadence enrollment / step send / unsubscribe
- Tone training submissions
- Template create / update
- **Partner CSV export** (logged with row count, market scope, IP, user; failed exports captured too)
- Unsubscribe link clicks

Reads are NOT audit-logged at the row level — CSV bulk exports are the exception because they materialize a downloadable copy of the whole dataset.

## Rate limiting

In-memory per-process limiter (`apps/web/src/lib/security/rate-limit.ts`):

| Endpoint / action                   | Limit                         |
| ----------------------------------- | ----------------------------- |
| Login (per IP)                      | 20/min                        |
| Login (per IP+email)                | 5/5min                        |
| Partner CSV export                  | 10/hour per (user, IP)        |
| Cron tick (`/api/cron/scrape-tick`) | Module-level re-entrancy lock |

**Multi-dyno warning.** This limiter is per-process. Scaling Railway above 1 instance under-counts because each dyno tracks independently. Wire `@upstash/ratelimit` against Upstash Redis before scaling out — the `checkLimit` function signature is the same so the swap is mechanical.

## Secrets management

- All credentials stored in env vars on Railway. Never committed.
- `.env.example` lists names only, no values.
- `.cowork-secrets` (Cowork session-local) holds the GitHub PAT for auto-push from sandboxed agent sessions. Treat as a secret; never commit.
- `ENCRYPTION_KEY` (AES-256-GCM) is used to encrypt OAuth tokens at rest in `User.oauthTokens`. Generate with `openssl rand -base64 32`. Rotating it invalidates existing OAuth tokens (users re-authorize).

## Public endpoints — what's safe to hit anonymously

| Endpoint                  | What it does                                                      |
| ------------------------- | ----------------------------------------------------------------- |
| `GET /`                   | Sign-in screen.                                                   |
| `GET /login`              | Sign-in screen.                                                   |
| `GET /rsvp/:token`        | RSVP form for an event invite.                                    |
| `GET /share/:token`       | Public share preview of a marketing design.                       |
| `GET /claim/:token`       | One-time partner-claim flow.                                      |
| `GET /arrival/:token`     | QR check-in arrival page.                                         |
| `GET /api/unsubscribe`    | One-click unsubscribe (HMAC-verified token).                      |
| `GET /api/health`         | Liveness + DB readiness. No data leaked.                          |
| `GET /api/events/:id/ics` | Calendar feed for a public event.                                 |
| `GET /api/events/:id/qr`  | QR PNG for a public event.                                        |
| `POST /api/webhooks/*`    | Storm Cloud + provider webhooks. HMAC-signed; verify-or-reject.   |
| `POST /api/inngest`       | Inngest job dispatcher. Inngest signs requests; verify-or-reject. |

Everything else requires a session.

## Threat scenarios + how we respond

**Stolen rep credentials.**

- Attacker can act as that rep, see their book, log activity. They cannot escalate to manager/admin without a second compromise.
- Audit log records every action under their user ID. After a breach, query `AuditLog` for `userId = <victim>` to inventory damage.
- Mitigation: deactivate user (`/admin/users` → toggle active), rotate `NEXTAUTH_SECRET` to invalidate all sessions org-wide.

**Compromised admin account.**

- Worst case. Attacker can export every partner CSV, see every audit entry, change roles.
- Detection: `AuditLog` write for `partner.export.csv` is the canary. Set up a daily query for any admin export the legitimate admin didn't run.
- Mitigation: deactivate, rotate session secret, audit `AuditLog` for everything in the relevant window.

**Public-token brute force.**

- RSVP / share / claim / arrival tokens are 24-byte random hex (192 bits). Brute-forcing one is computationally infeasible.
- Per-IP rate limit on the tier-1 routes catches naive scanners.

**SQL injection.**

- Prisma is the only DB layer; queries are parameterized. The two `$queryRawUnsafe` callsites use `$1` binding. Adding new raw queries triggers a spec review.

**XSS.**

- React escapes by default. `dangerouslySetInnerHTML` is used in the marketing wizard for rendered Satori SVG only — Satori output is a known-good subset of SVG, not user-typed markup.
- CSP `script-src 'self' 'unsafe-eval' 'unsafe-inline'` is intentionally loose to support Next dev HMR + Satori font fetcher; tightening this is on the runway after first launch.

**CSRF.**

- Next 15 server actions ship with a built-in CSRF token. Custom API routes are session-cookie-authenticated; webhooks are HMAC-verified.

## Reporting a vulnerability

Email **kirkd84@gmail.com** with subject `PartnerRadar security`. Please don't open a public GitHub issue.

Expected response: acknowledgment within 48 hours. Critical issues prioritized over feature work.

## Audit history

| Date       | Reviewer                    | Findings                                                                                                                                 |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-25 | Internal (Claude in Cowork) | First pass. Closed: HTTP security headers, login rate limiting, CSV export audit log + rate limit. Documented threat model in this file. |
