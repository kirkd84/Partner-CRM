/**
 * Drip cron — fires due steps in active drip enrollments.
 *
 * Per tick:
 *   1. Find every NewsletterDripEnrollment with status=ACTIVE and
 *      nextSendAt <= now (and a parent drip that's also active).
 *   2. For each, look up the step at the enrollment's position in
 *      that drip and instantiate a Newsletter row pre-targeted at
 *      this single recipient (audienceFilter = { partnerId: ... }).
 *   3. Reuse executeNewsletterSend to do the actual delivery so the
 *      tracking pixel + click rewriting + bounce handling all work.
 *      The newsletter row's status flips to SENT after.
 *   4. Advance the enrollment to position+1 + recompute nextSendAt
 *      from the next step's delayDays (relative to now). When we run
 *      out of steps, mark the enrollment COMPLETED.
 *
 * Audience filter for the per-recipient newsletter uses a
 * partnerIds whitelist that buildAudienceWhere understands; we
 * extend the filter shape minimally so this works without touching
 * the public AudienceFilter type.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@partnerradar/db';
import { executeNewsletterSend } from '@/app/(app)/newsletters/actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const due = await prisma.newsletterDripEnrollment.findMany({
    where: {
      status: 'ACTIVE',
      nextSendAt: { lte: new Date() },
      drip: { active: true },
    },
    include: {
      drip: {
        include: { steps: { orderBy: { position: 'asc' } } },
      },
    },
    take: 100,
  });

  let advanced = 0;
  let completed = 0;
  let failed = 0;

  for (const enr of due) {
    const step = enr.drip.steps.find((s) => s.position === enr.position);
    if (!step) {
      // Off-by-one or step removed — mark completed defensively.
      await prisma.newsletterDripEnrollment.update({
        where: { id: enr.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      completed++;
      continue;
    }

    // Spawn a single-recipient Newsletter row + send. We embed the
    // targeted partnerId in audienceFilter so buildAudienceWhere picks
    // exactly that one partner.
    try {
      const newsletter = await prisma.newsletter.create({
        data: {
          tenantId: enr.drip.tenantId ?? null,
          marketId: enr.drip.marketId ?? null,
          subject: step.subject,
          bodyText: step.bodyText,
          bodyMarkdown: step.bodyMarkdown,
          audienceFilter: {
            partnerIds: [enr.partnerId],
          } as object,
          status: 'DRAFT',
          createdBy: enr.drip.createdBy,
        },
        select: { id: true },
      });
      await executeNewsletterSend(newsletter.id);
    } catch (err) {
      console.warn('[drip-tick] send failed', enr.id, err);
      failed++;
      continue;
    }

    // Advance to next step or complete.
    const nextPos = enr.position + 1;
    const nextStep = enr.drip.steps.find((s) => s.position === nextPos);
    if (!nextStep) {
      await prisma.newsletterDripEnrollment.update({
        where: { id: enr.id },
        data: {
          position: nextPos,
          status: 'COMPLETED',
          completedAt: new Date(),
          nextSendAt: null,
        },
      });
      completed++;
    } else {
      await prisma.newsletterDripEnrollment.update({
        where: { id: enr.id },
        data: {
          position: nextPos,
          nextSendAt: new Date(Date.now() + nextStep.delayDays * 24 * 60 * 60 * 1000),
        },
      });
      advanced++;
    }
  }

  return NextResponse.json({ ok: true, advanced, completed, failed, due: due.length });
}
