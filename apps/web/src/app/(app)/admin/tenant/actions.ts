'use server';

/**
 * Tenant config actions — touchpoint templates + milestone years.
 * Admin-only; tenant scope is implicit via activeTenantId.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { activeTenantId } from '@/lib/tenant/context';

async function assertAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const ok = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN';
  if (!ok) throw new Error('FORBIDDEN: admin only');
  return session;
}

export async function setMilestoneYears(years: number[]): Promise<{ ok: true }> {
  const session = await assertAdmin();
  const tenantId = await activeTenantId(session);
  if (!tenantId) throw new Error('No active tenant');
  // Sanitize: positive integers, deduped, sorted, capped at 50.
  const clean = [...new Set(years.filter((y) => Number.isInteger(y) && y > 0 && y <= 100))]
    .sort((a, b) => a - b)
    .slice(0, 50);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { milestoneYears: clean },
  });
  revalidatePath('/admin/tenant');
  revalidatePath('/touchpoints');
  return { ok: true };
}

export interface TouchpointTemplatePatch {
  BIRTHDAY?: { subject: string; body: string };
  BUSINESS_ANNIVERSARY?: { subject: string; body: string };
  PARTNERSHIP_MILESTONE?: { subject: string; body: string };
}

export async function setTouchpointTemplates(
  patch: TouchpointTemplatePatch | null,
): Promise<{ ok: true }> {
  const session = await assertAdmin();
  const tenantId = await activeTenantId(session);
  if (!tenantId) throw new Error('No active tenant');
  // Strip empty subject/body pairs so the renderer falls back to the
  // hardcoded default for any kind the admin hasn't filled in.
  const clean: Record<string, { subject: string; body: string }> = {};
  if (patch) {
    for (const k of ['BIRTHDAY', 'BUSINESS_ANNIVERSARY', 'PARTNERSHIP_MILESTONE'] as const) {
      const v = patch[k];
      if (v && v.subject?.trim() && v.body?.trim()) {
        clean[k] = { subject: v.subject.trim(), body: v.body.trim() };
      }
    }
  }
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      touchpointTemplates: Object.keys(clean).length > 0 ? clean : null,
    },
  });
  revalidatePath('/admin/tenant');
  return { ok: true };
}
