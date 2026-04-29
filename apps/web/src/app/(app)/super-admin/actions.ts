'use server';

/**
 * /super-admin server actions. All are SUPER_ADMIN-gated.
 *
 * actAsTenantAction:
 *   Sets the `pr-act-as-tenant` cookie so subsequent page loads scope
 *   to that tenant. Empty tenantId clears the cookie.
 *
 *   Why a cookie vs JWT mutation: NextAuth v5's JWT callback runs on
 *   sign-in by default. Triggering an update from a server action
 *   requires a client-side `useSession().update()` round-trip, which
 *   adds complexity for no security gain — the cookie is HttpOnly +
 *   Secure + same-site so it can't be set by the page itself.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { prisma, Prisma } from '@partnerradar/db';
import { ACT_AS_COOKIE, requireSuperAdmin } from '@/lib/tenant/context';

export async function actAsTenantAction(formData: FormData): Promise<void> {
  const session = await auth();
  requireSuperAdmin(session);

  const tenantId = (formData.get('tenantId') as string | null) ?? '';
  const jar = await cookies();

  if (!tenantId) {
    jar.delete(ACT_AS_COOKIE);
  } else {
    // Validate the tenant exists before stamping the cookie so a typo'd
    // hidden form value can't put the session in a phantom-tenant state.
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error('Tenant not found');
    jar.set(ACT_AS_COOKIE, tenantId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      // 12h — matches super-admin session length. Forces a re-pick
      // overnight so a left-open laptop doesn't keep cross-tenant
      // access indefinitely.
      maxAge: 60 * 60 * 12,
      path: '/',
    });
    // Audit-log the act-as so there's a paper trail when a super-admin
    // touches a tenant's data.
    await prisma.auditLog
      .create({
        data: {
          userId: session!.user!.id,
          action: 'super_admin.act_as_tenant',
          entityType: 'Tenant',
          entityId: tenantId,
          metadata: { tenantSlug: tenant.slug, tenantName: tenant.name } as never,
        },
      })
      .catch((err) => console.warn('[super-admin] audit log failed', err));
  }

  revalidatePath('/super-admin');
  revalidatePath('/admin');
  revalidatePath('/radar');
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  legalName?: string;
  address?: string;
  phone?: string;
  fromAddress?: string;
  websiteUrl?: string;
  primaryHex?: string;
  /** Email of the first ADMIN to seed for this tenant. */
  adminEmail: string;
  adminName: string;
  /** Temporary password — admin should rotate immediately. */
  adminPassword: string;
}

export async function createTenant(input: CreateTenantInput): Promise<{ id: string }> {
  const session = await auth();
  requireSuperAdmin(session);

  const slug = input.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
  if (!slug) throw new Error('Slug must contain at least one alphanumeric character.');
  if (!input.name.trim()) throw new Error('Name is required.');
  if (!input.adminEmail.trim()) throw new Error('Admin email is required.');
  if (input.adminPassword.length < 10) {
    throw new Error('Admin password must be at least 10 characters.');
  }

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) throw new Error(`Tenant slug "${slug}" already exists.`);

  // bcryptjs is in serverExternalPackages so it's not bundled. Dynamic
  // import is ESM-safe (eval-require blew up in the production ESM
  // build — see instrumentation.ts seed function for the same fix).
  const bcryptMod = (await import('bcryptjs')) as unknown as {
    hash?: (s: string, r: number) => Promise<string>;
    default?: { hash: (s: string, r: number) => Promise<string> };
  };
  const hash = (bcryptMod.hash ?? bcryptMod.default?.hash) as
    | ((s: string, r: number) => Promise<string>)
    | undefined;
  if (!hash) throw new Error('bcryptjs.hash not exported');
  const passwordHash = await hash(input.adminPassword, 10);

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: input.name.trim(),
      legalName: input.legalName?.trim() || null,
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      fromAddress: input.fromAddress?.trim() || null,
      websiteUrl: input.websiteUrl?.trim() || null,
      primaryHex: input.primaryHex?.trim() || null,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  // Seed first admin for this tenant. If the email is already taken
  // (e.g. user already exists in another tenant) we surface a clear
  // error rather than silently re-tenant them.
  const emailLower = input.adminEmail.trim().toLowerCase();
  const userExists = await prisma.user.findUnique({ where: { email: emailLower } });
  if (userExists) {
    throw new Error(
      `User ${emailLower} already exists${userExists.tenantId ? ' in another tenant' : ''}. Pick a different admin email.`,
    );
  }

  await prisma.user.create({
    data: {
      email: emailLower,
      name: input.adminName.trim() || emailLower,
      role: 'ADMIN',
      avatarColor: input.primaryHex || '#1e40af',
      passwordHash,
      tenantId: tenant.id,
      active: true,
    },
  });

  await prisma.auditLog
    .create({
      data: {
        userId: session!.user!.id,
        action: 'super_admin.create_tenant',
        entityType: 'Tenant',
        entityId: tenant.id,
        metadata: { slug, name: input.name, adminEmail: emailLower } as never,
      },
    })
    .catch((err) => console.warn('[super-admin] audit log failed', err));

  revalidatePath('/super-admin');
  return tenant;
}

export async function updateTenantStatusAction(formData: FormData): Promise<void> {
  const session = await auth();
  requireSuperAdmin(session);
  const tenantId = formData.get('tenantId') as string;
  const status = formData.get('status') as 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'CANCELLED';
  if (!tenantId || !status) throw new Error('Missing tenantId or status.');
  await prisma.tenant.update({ where: { id: tenantId }, data: { status } });
  await prisma.auditLog
    .create({
      data: {
        userId: session!.user!.id,
        action: 'super_admin.update_tenant_status',
        entityType: 'Tenant',
        entityId: tenantId,
        metadata: { status } as never,
      },
    })
    .catch(() => {});
  revalidatePath('/super-admin');
  revalidatePath(`/super-admin/tenants/${tenantId}`);
}

// Suppress unused-import warnings — Prisma is referenced via `as never`
// casts on the metadata fields above.
export type _Prisma = typeof Prisma;

export async function redirectToTenantsList(): Promise<void> {
  redirect('/super-admin');
}
