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

### Risk-1 (must fix before a second tenant signs up)

These touch tenant-scoped data without an explicit tenant filter today. Today they accidentally work because there's only one tenant; they'll leak between tenants the moment there are two.

- `/admin/audit-log` — currently returns all rows; needs `WHERE userId IN (tenant users)` or a `tenantId` column on AuditLog
- `/admin/users` — returns all users; needs `WHERE tenantId = activeTenantId(session)`
- `/admin/markets` — returns all markets; needs `WHERE tenantId = activeTenantId(session)`
- Marketing wizard `MwBrand` / `MwDesign` queries — workspace gate exists but doesn't yet check the workspace's tenant matches the session's
- The lasso scrape, Google Places jobs, state-board imports — all scope by market which is tenant-safe; review explicitly anyway
- `/api/admin/partners/export` — scopes by market list; tenant-safe by transitivity, audit-log it for a second tenant launch

### Risk-2 (silent privacy leak)

- `Partner.assignedRepId` cross-tenant: a rep moved between tenants could end up still owning partners in their old tenant. Fix: when changing a user's tenantId, null out their assignedPartners.
- `AuditLog` doesn't have a tenantId column. Adding one is a follow-up DDL pass.

### Risk-3 (operational)

- Per-tenant subdomain routing (`acme.partnerradar.app`) — not built. Today everyone uses one domain and the tenant is derived from session. Fine for v1, expected for v2.
- Per-tenant branding in the UI — TopNav still pulls from `packages/config/tenant.ts`. Should pull from the active tenant's row.
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

- **2026-04-25 (this commit):** Schema + auth + super-admin console + Roof Tech tenant + Copayee super-admin seeded. Existing data migrated to "demo" tenant. Build + deploy succeeds.
- **Before second tenant signs:** Risk-1 list above. ~1 day of work to walk every query and add tenant filtering.
- **v2:** Subdomain routing, per-tenant branding wiring, Stripe billing.
