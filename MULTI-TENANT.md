# Multi-tenant model

PartnerRadar is built to host multiple isolated customer workspaces ("tenants") on a single deployment. This doc covers the data model, the access-control rules, the super-admin operator console, and — importantly — what's still left to retrofit before a second paying tenant goes live.

## Data model

```
Tenant
  ├── id (cuid)
  ├── slug ("roof-technologies", "acme-roofing")
  ├── name + branding fields (legalName, address, primaryHex, …)
  ├── status (ACTIVE / TRIAL / SUSPENDED / CANCELLED)
  ├── User[]      (User.tenantId)
  ├── Market[]    (Market.tenantId)
  └── MwWorkspace[] (MwWorkspace.tenantId)
```

Everything below `Market` (Partner, Activity, Contact, Event, Cadence, ScrapeJob, ScrapedLead, HitList, Appointment, …) is scoped _transitively_ through `marketId`. As long as a query filters by a market the tenant owns, the rest is safe by construction.

## Roles

| Role            | Sees                                                     | tenantId     |
| --------------- | -------------------------------------------------------- | ------------ |
| **REP**         | Partners assigned to them or unassigned in their markets | their tenant |
| **MANAGER**     | Partners + activity in their markets                     | their tenant |
| **ADMIN**       | Everything in their tenant                               | their tenant |
| **SUPER_ADMIN** | Cross-tenant operator — can act-as any tenant            | **null**     |

Super-admin is reserved for the platform operator (Copayee). It's not a "very powerful tenant admin" — it's a different concept entirely. SUPER_ADMINs don't belong to any tenant, can't be invited from inside `/admin/users`, and are seeded only via `instrumentation.ts`.

## Tenant context resolution

Every server-side query that touches tenant-scoped data MUST scope by `activeTenantId(session)` from `apps/web/src/lib/tenant/context.ts`. Resolution rules:

1. Regular user (REP/MANAGER/ADMIN) → `session.user.tenantId`. The `pr-act-as-tenant` cookie is **ignored** for them — a tenant employee can't escape their tenant by setting a cookie.
2. SUPER_ADMIN with `pr-act-as-tenant` cookie → that tenant.
3. SUPER_ADMIN with no cookie → `null`. Most pages redirect to `/super-admin`; a few (audit log, tenant list) opt in to seeing all.

**Helpers:**

- `activeTenantId(session)` — returns the tenant id or null.
- `tenantWhere(session)` — Prisma `where` fragment for models with a direct `tenantId` (Market, MwWorkspace, User).
- `marketTenantWhere(session)` — Prisma `where` fragment for models scoped through Market (Partner, Activity, Event, …).
- `requireSuperAdmin(session)` — throw if not super-admin.
- `assertTenantAccess(session, tenantId)` — throw unless caller's tenant matches (or is super-admin).

## Super-admin console

Lives at `/super-admin`. SUPER_ADMIN-only.

- `/super-admin` — list every tenant with markets/users counts; click "Act as" to scope your session into that tenant.
- `/super-admin/tenants/new` — provision a new tenant + seed first ADMIN.
- `/super-admin/tenants/[id]` — tenant detail; suspend / activate / cancel; act-as.

The act-as flow sets an HttpOnly `pr-act-as-tenant` cookie (12h expiry). Audit-logged on every set so there's a trail when a super-admin touches a customer's data.

## Seed accounts

On every server boot `seedTenantsAndAdmins()` runs in `instrumentation.ts`:

| Tenant                      | Slug                | Admin email                 | Password          |
| --------------------------- | ------------------- | --------------------------- | ----------------- |
| **Demo Workspace**          | `demo`              | `admin@demo.com` (existing) | `Demo1234!`       |
| **Roof Technologies**       | `roof-technologies` | `kirk@rooftechnologies.com` | `ChangeMe!2026`   |
| _(no tenant — super-admin)_ | —                   | `kirk@copayee.com`          | `SuperAdmin!2026` |

**Rotate every default password before launch.** They're checked-in via the seed function and intentionally known.

## What is NOT yet retrofit (the launch blocker)

The schema is multi-tenant. The auth layer is multi-tenant. **The query layer is mostly NOT.** Most existing pages still scope by `session.user.markets` (which is implicitly tenant-safe because users only get markets in their own tenant) — but several pages and queries don't, and need a manual pass before a second paying tenant goes live:

### Risk-1 — STATUS

| Item                                        | Status                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/audit-log` tenant filter            | ✅ done — scoped via `activeTenantId`. SUPER_ADMIN with no act-as sees all (cross-tenant audit view, by design).                                                                                           |
| `/admin/users` tenant filter                | ✅ done — scoped via `activeTenantId`.                                                                                                                                                                     |
| `/admin/markets` tenant filter              | ✅ done — scoped via `activeTenantId`.                                                                                                                                                                     |
| `MwDesign` PNG/PDF tenant gate              | ✅ done — `assertWorkspaceTenant(session, design.workspace.tenantId)` in both routes.                                                                                                                      |
| `AuditLog.tenantId` column                  | ✅ done — added via DDL; existing rows backfilled to demo (except `super_admin.*` actions which stay null on purpose).                                                                                     |
| Lasso scrape / Google Places / state boards | tenant-safe by transitivity (filter by market → market is in tenant); reviewed. No additional retrofit.                                                                                                    |
| `/api/admin/partners/export`                | tenant-safe by transitivity (scopes by market list); audit-logged with `actorIp`, `marketScope`, `rows`. No additional retrofit.                                                                           |
| Studio actions.ts                           | tenant-safe by transitivity (workspace lookups go through `partnerRadarMarketId` → tenant-safe via Market). Server-action paths reviewed; PNG/PDF routes carry the explicit `assertWorkspaceTenant` check. |

### Risk-2 (silent privacy leak)

- `Partner.assignedRepId` cross-tenant: a rep moved between tenants could end up still owning partners in their old tenant. Fix: when changing a user's tenantId, null out their assignedPartners. ⏳ NOT DONE — admin/users role/market change action needs the cleanup.
- `AuditLog.tenantId`: ✅ done — column added + writes backfilled.

### Risk-3 (operational)

- Per-tenant subdomain routing (`acme.partnerradar.app`) — not built. Today everyone uses one domain and the tenant is derived from session. Fine for v1, expected for v2.
- Per-tenant branding in the UI — ✅ done for the TopNav brand chip (loaded from active tenant's row). Email From: addresses + cadence senders + studio designs still pull from `packages/config/tenant.ts` and need the same treatment.
- Stripe billing per tenant — not built. Today there's no plan / quota enforcement at the tenant level.
- Per-tenant rate limiting — the in-memory limiter doesn't separate tenants in its keying. Fine because keys are user-id-based, but worth noting.

## Decision tree before adding code

1. Does this code read tenant-scoped data?
   - Yes → use `tenantWhere` or `marketTenantWhere`.
   - No → carry on.
2. Is this code a SUPER_ADMIN-only operation?
   - Yes → `requireSuperAdmin(session)` at the top.
   - No → carry on.
3. Is this a server action that mutates tenant-scoped data?
   - Yes → `assertTenantAccess(session, tenantId)` at the top.
   - No → carry on.

Centralizing the policy in `lib/tenant/context.ts` means a future security review is one file, not a hundred.

## Migration timeline

- **2026-04-25 first commit:** Schema + auth + super-admin console + Roof Tech tenant + Copayee super-admin seeded. Existing data migrated to "demo" tenant.
- **2026-04-25 retrofit commit:** Risk-1 punch list closed. AuditLog gets `tenantId` + `metadata` columns (the latter was missing entirely — server actions writing to it were silently dropping the field). Per-tenant TopNav branding. SECURITY.md + MULTI-TENANT.md updated.
- **Remaining before second tenant signs:** Risk-2 `assignedRepId` cleanup on user→tenant change; Risk-3 per-tenant email From: addresses; Stripe billing wiring; subdomain routing if desired.
