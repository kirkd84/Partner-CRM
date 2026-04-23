'use server';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import type { PartnerStage } from '@partnerradar/types';
import { stormClient } from '@partnerradar/integrations';
import { auth } from '@/auth';

/**
 * Server actions for the partner detail page.
 * All actions enforce the SPEC §5 permissions model before mutating.
 */

async function assertCanEdit(partnerId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: {
      marketId: true,
      assignedRepId: true,
      archivedAt: true,
      stage: true,
      companyName: true,
      publicId: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      partnerType: true,
    },
  });
  if (!partner) throw new Error('NOT_FOUND');
  if (partner.archivedAt) throw new Error('ARCHIVED');

  const inMarket = session.user.markets.includes(partner.marketId);
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  const isOwner = partner.assignedRepId === session.user.id;

  if (!inMarket) throw new Error('FORBIDDEN');
  if (!isManagerPlus && !isOwner) throw new Error('FORBIDDEN');

  return { session, partner, isManagerPlus };
}

export async function changeStage(partnerId: string, stage: PartnerStage, note?: string) {
  const { session } = await assertCanEdit(partnerId);
  await prisma.$transaction([
    prisma.partner.update({
      where: { id: partnerId },
      data: { stage, stageChangedAt: new Date() },
    }),
    prisma.activity.create({
      data: {
        partnerId,
        userId: session.user.id,
        type: 'STAGE_CHANGE',
        body: note ?? `Moved stage to ${stage.replace(/_/g, ' ').toLowerCase()}.`,
        metadata: { stage },
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'partner',
        entityId: partnerId,
        action: 'stage_change',
        diff: { stage },
      },
    }),
  ]);
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/radar');
  revalidatePath('/partners');
}

export async function addComment(partnerId: string, body: string) {
  if (!body.trim()) return;
  const { session } = await assertCanEdit(partnerId);
  await prisma.activity.create({
    data: {
      partnerId,
      userId: session.user.id,
      type: 'COMMENT',
      body: body.trim().slice(0, 5000),
    },
  });
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/radar');
}

/**
 * Activate a partner — the SPEC §3.17 balloon moment.
 *
 * Flow:
 *   1. Permission check (manager+ only)
 *   2. Serialize partner + primary contact into Storm's CreatePartnerPayload
 *   3. Call stormClient.createReferralPartner() — mock by default
 *   4. Persist stormCloudId, set stage=ACTIVATED, activatedAt=now, activatedBy
 *   5. Log Activity(ACTIVATION) and AuditLog
 *   6. Return payload so the client can fire balloons + toast
 */
export async function activatePartner(partnerId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN: manager+ required to activate partners');
  }

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: {
      contacts: { where: { isPrimary: true }, take: 1 },
      market: { select: { id: true, name: true } },
    },
  });
  if (!partner) throw new Error('NOT_FOUND');
  if (partner.stage === 'ACTIVATED') {
    return { alreadyActivated: true, stormCloudId: partner.stormCloudId ?? null };
  }

  const primary = partner.contacts[0];
  const primaryEmail = (
    primary?.emails as Array<{ address: string; primary?: boolean }> | null
  )?.find((e) => e.primary)?.address;
  const primaryPhone = (
    primary?.phones as Array<{ number: string; primary?: boolean }> | null
  )?.find((p) => p.primary)?.number;

  // Push to Storm Cloud (mock by default; real in Phase 5 when API lands)
  const { stormCloudId } = await stormClient().createReferralPartner({
    externalId: partner.publicId,
    companyName: partner.companyName,
    partnerType: partner.partnerType,
    address: partner.address ?? undefined,
    marketCode: partner.market.name,
    primaryContact: primary
      ? {
          name: primary.name,
          email: primaryEmail,
          phone: primaryPhone,
        }
      : undefined,
    metadata: {
      activatedAt: new Date().toISOString(),
      activatedBy: session.user.id,
      notes: partner.notes ?? undefined,
    },
  });

  const now = new Date();
  await prisma.$transaction([
    prisma.partner.update({
      where: { id: partnerId },
      data: {
        stage: 'ACTIVATED',
        stageChangedAt: now,
        activatedAt: now,
        activatedBy: session.user.id,
        stormCloudId,
      },
    }),
    prisma.activity.create({
      data: {
        partnerId,
        userId: session.user.id,
        type: 'ACTIVATION',
        body: `Activated and pushed to Storm Cloud. 🎉 (stormCloudId: ${stormCloudId})`,
        metadata: { stormCloudId },
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'partner',
        entityId: partnerId,
        action: 'activate',
        diff: { stormCloudId, activatedAt: now.toISOString() } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/radar');
  revalidatePath('/partners');

  return { alreadyActivated: false, stormCloudId };
}
