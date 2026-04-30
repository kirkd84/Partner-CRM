'use server';

/**
 * Newsletter drip server actions.
 *
 * A drip is an ordered series of newsletter steps that fire at
 * delayDays intervals after enrollment. Each step is its own template;
 * when the cron tick (lib/jobs/drip-tick or /api/cron/drip-tick) sees
 * an enrollment whose nextSendAt is in the past, it instantiates a
 * Newsletter row from the step + uses the existing send pipeline so
 * recipient tracking, bounce handling, etc. all reuse the same code.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { activeTenantId } from '@/lib/tenant/context';
import type { AudienceFilter } from '../actions';

async function assertManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const ok =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!ok) throw new Error('FORBIDDEN: manager+');
  return session;
}

export interface CreateDripInput {
  name: string;
  description?: string;
  audienceFilter: AudienceFilter;
  triggerType?: 'ON_PARTNER_ACTIVATED' | 'ON_TAG_ADDED' | 'MANUAL';
  triggerConfig?: Record<string, unknown>;
  marketId?: string | null;
}

export async function createDrip(input: CreateDripInput): Promise<{ id: string }> {
  const session = await assertManagerPlus();
  if (!input.name.trim()) throw new Error('Name is required');
  const tenantId = await activeTenantId(session);
  const drip = await prisma.newsletterDrip.create({
    data: {
      tenantId: tenantId ?? null,
      marketId: input.marketId ?? null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      audienceFilter: input.audienceFilter as object,
      triggerType: input.triggerType ?? 'MANUAL',
      triggerConfig: (input.triggerConfig ?? {}) as object,
      createdBy: session.user.id,
    },
    select: { id: true },
  });
  revalidatePath('/newsletters/drips');
  return { id: drip.id };
}

export interface AddStepInput {
  dripId: string;
  delayDays: number;
  subject: string;
  bodyText: string;
  bodyMarkdown?: boolean;
}

export async function addStep(input: AddStepInput): Promise<{ id: string }> {
  await assertManagerPlus();
  if (!input.subject.trim()) throw new Error('Subject required');
  if (!input.bodyText.trim()) throw new Error('Body required');
  const drip = await prisma.newsletterDrip.findUnique({
    where: { id: input.dripId },
    select: { id: true },
  });
  if (!drip) throw new Error('Drip not found');
  const max = await prisma.newsletterDripStep.aggregate({
    where: { dripId: input.dripId },
    _max: { position: true },
  });
  const position = (max._max.position ?? -1) + 1;
  const step = await prisma.newsletterDripStep.create({
    data: {
      dripId: input.dripId,
      position,
      delayDays: Math.max(0, Math.floor(input.delayDays)),
      subject: input.subject.trim(),
      bodyText: input.bodyText,
      bodyMarkdown: input.bodyMarkdown ?? true,
    },
    select: { id: true },
  });
  revalidatePath(`/newsletters/drips/${input.dripId}`);
  return { id: step.id };
}

export async function removeStep(stepId: string): Promise<{ ok: true }> {
  await assertManagerPlus();
  const step = await prisma.newsletterDripStep.findUnique({
    where: { id: stepId },
    select: { id: true, dripId: true, position: true },
  });
  if (!step) throw new Error('Step not found');
  await prisma.newsletterDripStep.delete({ where: { id: stepId } });
  // Re-pack positions so the UI doesn't show gaps.
  const remaining = await prisma.newsletterDripStep.findMany({
    where: { dripId: step.dripId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  await Promise.all(
    remaining.map((s, idx) =>
      prisma.newsletterDripStep.update({ where: { id: s.id }, data: { position: idx } }),
    ),
  );
  revalidatePath(`/newsletters/drips/${step.dripId}`);
  return { ok: true };
}

export async function setDripActive(id: string, active: boolean): Promise<{ ok: true }> {
  await assertManagerPlus();
  await prisma.newsletterDrip.update({
    where: { id },
    data: { active },
  });
  revalidatePath('/newsletters/drips');
  revalidatePath(`/newsletters/drips/${id}`);
  return { ok: true };
}

/**
 * Manually enroll partners matching the audience filter. Skips
 * partners already enrolled. Returns counts for the UI feedback.
 */
export async function enrollMatching(dripId: string): Promise<{
  enrolled: number;
  alreadyEnrolled: number;
  skippedNoEmail: number;
}> {
  const session = await assertManagerPlus();
  const drip = await prisma.newsletterDrip.findUnique({
    where: { id: dripId },
    include: { steps: { orderBy: { position: 'asc' }, take: 1 } },
  });
  if (!drip) throw new Error('Drip not found');
  if (drip.steps.length === 0) {
    throw new Error('Drip has no steps yet — add at least one before enrolling.');
  }
  const tenantId = await activeTenantId(session);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    archivedAt: null,
    emailUnsubscribedAt: null,
  };
  if (drip.marketId) {
    where.marketId = drip.marketId;
  } else if (tenantId) {
    const ms = await prisma.market.findMany({
      where: { tenantId },
      select: { id: true },
    });
    where.marketId = { in: ms.map((m) => m.id) };
  }
  const filter = (drip.audienceFilter ?? {}) as AudienceFilter;
  if (filter.partnerTypes && filter.partnerTypes.length > 0) {
    where.partnerType = { in: filter.partnerTypes };
  }
  if (filter.stages && filter.stages.length > 0) {
    where.stage = { in: filter.stages };
  } else if (!filter.includeInactive) {
    where.stage = { not: 'INACTIVE' };
  }
  if (!filter.includeCustomers) where.customerOnly = false;

  const partners = await prisma.partner.findMany({
    where,
    select: {
      id: true,
      contacts: {
        where: { isPrimary: true },
        select: { id: true, emails: true },
        take: 1,
      },
    },
  });
  let enrolled = 0;
  let alreadyEnrolled = 0;
  let skippedNoEmail = 0;
  const firstStep = drip.steps[0]!;
  const firstSendAt = new Date(Date.now() + firstStep.delayDays * 24 * 60 * 60 * 1000);
  for (const p of partners) {
    const c = p.contacts[0];
    const email = (c?.emails as Array<{ address?: string; primary?: boolean }> | undefined)?.find(
      (e) => e?.address,
    )?.address;
    if (!email || !c?.id) {
      skippedNoEmail++;
      continue;
    }
    const exists = await prisma.newsletterDripEnrollment.findFirst({
      where: { dripId: drip.id, partnerId: p.id, contactId: c.id },
      select: { id: true },
    });
    if (exists) {
      alreadyEnrolled++;
      continue;
    }
    await prisma.newsletterDripEnrollment.create({
      data: {
        dripId: drip.id,
        partnerId: p.id,
        contactId: c.id,
        email,
        position: 0,
        nextSendAt: firstSendAt,
        status: 'ACTIVE',
      },
    });
    enrolled++;
  }
  revalidatePath(`/newsletters/drips/${drip.id}`);
  return { enrolled, alreadyEnrolled, skippedNoEmail };
}

export async function pauseEnrollment(enrollmentId: string): Promise<{ ok: true }> {
  await assertManagerPlus();
  await prisma.newsletterDripEnrollment.update({
    where: { id: enrollmentId },
    data: { status: 'PAUSED' },
  });
  return { ok: true };
}
