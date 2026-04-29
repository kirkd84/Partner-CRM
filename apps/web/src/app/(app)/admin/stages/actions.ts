'use server';

/**
 * Per-tenant stage label/color/order overrides.
 *
 * - Reading: page.tsx merges global defaults (tenantId=null) with the
 *   tenant's row, tenant winning on conflict.
 * - Writing: upsert keyed on (tenantId, stage). Super-admin acting-as
 *   a tenant writes that tenant's row; super-admin not acting-as
 *   writes the global row directly.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { activeTenantId } from '@/lib/tenant/context';
import type { PartnerStage } from '@partnerradar/types';

async function assertManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const ok =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!ok) throw new Error('FORBIDDEN');
  return session;
}

export async function upsertStageConfig(input: {
  stage: PartnerStage;
  label: string;
  color: string;
  sortOrder: number;
}) {
  const session = await assertManagerPlus();
  const tenantId = await activeTenantId(session);

  if (!input.label.trim()) throw new Error('Label is required');
  // Loose hex validation — let the user paste rgb() if they really
  // want to (Tailwind accepts it on inline style), but warn if it
  // looks bonkers.
  if (input.color.length > 32) throw new Error('Color string is too long');

  await prisma.stageConfig.upsert({
    where: {
      tenantId_stage: {
        tenantId: tenantId ?? null,
        stage: input.stage,
      },
    },
    create: {
      tenantId: tenantId ?? null,
      stage: input.stage,
      label: input.label.trim(),
      color: input.color.trim(),
      sortOrder: input.sortOrder,
    },
    update: {
      label: input.label.trim(),
      color: input.color.trim(),
      sortOrder: input.sortOrder,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'StageConfig',
      entityId: `${tenantId ?? 'global'}:${input.stage}`,
      action: 'UPDATE',
      diff: {
        tenantId: tenantId ?? null,
        stage: input.stage,
        label: input.label.trim(),
        color: input.color.trim(),
        sortOrder: input.sortOrder,
      },
    },
  });

  revalidatePath('/admin/stages');
  // The labels show up in /partners list, /radar, /reports, etc.
  // Conservative blast radius — revalidate the highest-traffic pages.
  revalidatePath('/partners');
  revalidatePath('/radar');
  return { ok: true };
}

export async function reorderStages(orderedStages: PartnerStage[]) {
  const session = await assertManagerPlus();
  const tenantId = await activeTenantId(session);

  // For each stage, set sortOrder = index. We use upsert so a stage
  // that doesn't have a tenant override yet gets one created from the
  // global defaults the page UI shows.
  for (let i = 0; i < orderedStages.length; i++) {
    const stage = orderedStages[i]!;
    const existing = await prisma.stageConfig.findFirst({
      where: { tenantId: tenantId ?? null, stage },
    });
    if (existing) {
      await prisma.stageConfig.update({
        where: { id: existing.id },
        data: { sortOrder: i },
      });
    } else {
      // Pull current label/color from the global row to seed the
      // tenant override; otherwise we'd lose the visual identity.
      const global = await prisma.stageConfig.findFirst({
        where: { tenantId: null, stage },
      });
      if (!global) continue;
      await prisma.stageConfig.create({
        data: {
          tenantId: tenantId ?? null,
          stage,
          label: global.label,
          color: global.color,
          sortOrder: i,
        },
      });
    }
  }

  revalidatePath('/admin/stages');
  revalidatePath('/partners');
  revalidatePath('/radar');
  return { ok: true };
}
