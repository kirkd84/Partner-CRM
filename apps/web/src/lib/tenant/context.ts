/**
 * Tenant context resolution.
 *
 * Single rule: every server-side query that touches tenant-scoped data
 * (Market, Partner, Activity, Event, MwDesign, …) MUST scope by the
 * value `activeTenantId(session)` returns. The function captures the
 * full multi-tenant policy in one place so the rest of the codebase
 * doesn't have to know about super-admin act-as cookies.
 *
 * Resolution order:
 *   1. Regular user (REP/MANAGER/ADMIN with tenantId) → their tenantId.
 *      Cannot be overridden — ignoring the act-as cookie keeps a
 *      tenant employee from accidentally (or maliciously) setting it.
 *   2. SUPER_ADMIN with `pr-act-as-tenant` cookie set → that tenant.
 *      The cookie is set by /super-admin/tenants/:id/act-as.
 *   3. SUPER_ADMIN with no cookie → null. Most pages should redirect
 *      them to /super-admin to pick a tenant; admin pages that show
 *      cross-tenant data (audit-log, etc.) can opt in to seeing all.
 */

import { cookies } from 'next/headers';

export const ACT_AS_COOKIE = 'pr-act-as-tenant';

interface SessionLike {
  user?: {
    role?: 'REP' | 'MANAGER' | 'ADMIN' | 'SUPER_ADMIN';
    tenantId?: string | null;
  };
}

/**
 * Returns the tenant id the session is currently acting as, or null
 * if the user is a super-admin who hasn't picked one yet.
 *
 * MUST be called from a server context (page / route / server action)
 * because it reads cookies. Throws if you call it from the client.
 */
export async function activeTenantId(session: SessionLike | null): Promise<string | null> {
  if (!session?.user) return null;
  if (session.user.role === 'SUPER_ADMIN') {
    const jar = await cookies();
    const c = jar.get(ACT_AS_COOKIE)?.value;
    return c || null;
  }
  return session.user.tenantId ?? null;
}

/**
 * Throws unless the caller is a SUPER_ADMIN. Use to gate /super-admin
 * routes + cross-tenant operations.
 */
export function requireSuperAdmin(session: SessionLike | null): asserts session is SessionLike & {
  user: { role: 'SUPER_ADMIN' };
} {
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
    throw new Error('FORBIDDEN: super-admin only');
  }
}

/**
 * Throws unless the caller is allowed to operate on the given tenant.
 * Regular users: must match their tenantId. Super-admins: anything.
 *
 * Use anywhere you'd otherwise write `if (session.user.tenantId !== id)
 * throw FORBIDDEN`. Centralizing keeps the policy in one file.
 */
export function assertTenantAccess(session: SessionLike | null, tenantId: string): void {
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role === 'SUPER_ADMIN') return;
  if (session.user.tenantId !== tenantId) {
    throw new Error('FORBIDDEN: tenant mismatch');
  }
}

/**
 * Convenience for queries: a Prisma `where` fragment that scopes to
 * the active tenant. Returns `{}` for super-admins with no act-as
 * cookie, so they see everything — call `requireActiveTenant` first
 * if that's not what you want.
 *
 * Usage:
 *   const where = { ...await tenantWhere(session), archivedAt: null };
 *   prisma.partner.findMany({ where });
 *
 * Important: this only works for models that have a direct `tenantId`
 * column (Market, MwWorkspace, User). For models scoped THROUGH market
 * (Partner, Activity, etc.), use `marketTenantWhere` below.
 */
export async function tenantWhere(session: SessionLike | null): Promise<{ tenantId?: string }> {
  const id = await activeTenantId(session);
  if (id == null) return {};
  return { tenantId: id };
}

/**
 * `where` fragment for models that don't have a direct tenantId column
 * but are scoped through market. Joins via the market relation.
 *
 * Usage:
 *   const where = {
 *     ...(await marketTenantWhere(session)),
 *     stage: 'NEW_LEAD',
 *   };
 *   prisma.partner.findMany({ where });
 */
export async function marketTenantWhere(
  session: SessionLike | null,
): Promise<{ market?: { tenantId: string } }> {
  const id = await activeTenantId(session);
  if (id == null) return {};
  return { market: { tenantId: id } };
}

/**
 * Defense-in-depth: throw unless the resource (typically an MwWorkspace
 * or its derivatives like MwDesign / MwBrand) belongs to the tenant the
 * session is acting as.
 *
 * Resolution:
 *   - SUPER_ADMIN with no act-as cookie → allowed (cross-tenant view).
 *   - SUPER_ADMIN acting-as → must match.
 *   - Regular user → must match their tenantId.
 *
 * Use at the top of any server route / action that loads a MwDesign /
 * MwBrand / MwWorkspace by id. The market-membership check is the
 * primary gate; this is the secondary check that catches "I'm in
 * tenant A but somehow have a workspace id that belongs to tenant B."
 */
export async function assertWorkspaceTenant(
  session: SessionLike | null,
  workspaceTenantId: string | null | undefined,
): Promise<void> {
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role === 'SUPER_ADMIN') {
    const acting = await activeTenantId(session);
    // Super-admin not acting-as → allowed. Acting-as → must match.
    if (acting != null && acting !== workspaceTenantId) {
      throw new Error('FORBIDDEN: workspace tenant mismatch');
    }
    return;
  }
  // Regular user — strict match. workspaceTenantId can be null on
  // pre-multi-tenant workspaces; treat null as "demo tenant" via
  // backfill, which means a non-demo user shouldn't see them.
  if (session.user.tenantId !== workspaceTenantId) {
    throw new Error('FORBIDDEN: workspace tenant mismatch');
  }
}
