/**
 * Post-event attendance postmortem (SPEC_EVENTS §10.4 + §11).
 *
 * Runs every 10 minutes and:
 *   1. Finds events that ended >24h ago but haven't been reconciled
 *      (EvEvent.status not yet marked COMPLETED). Lookback cap of
 *      14 days so we don't re-scan ancient events repeatedly.
 *   2. For each CONFIRMED invite with a primary ticket that doesn't
 *      have `checkedInAt` → flip status to NO_SHOW and log an
 *      Activity of type=EVENT_NO_SHOW on the Partner.
 *   3. For each CONFIRMED invite whose primary ticket DID check in →
 *      log an Activity type=EVENT_ATTENDED on the Partner.
 *   4. For walk-in (AD_HOC) invitees with partnerId populated via
 *      later "Attach to Partner", log EVENT_WALKED_IN.
 *   5. Recompute `eventAcceptanceRate`, `eventShowRate`,
 *      `reliabilityScore` for each Partner who appeared on the event.
 *   6. Email event hosts + creator with a plain-English summary:
 *      "17 confirmed, 15 attended, 2 no-shows, 1 walk-in."
 *   7. Mark the event COMPLETED so it never gets reconciled twice.
 *
 * Idempotent: the COMPLETED status gate is the permanent marker. If
 * the job errors part-way through, the next tick retries whatever
 * wasn't finished — Activity writes use `createMany` but we also
 * guard against re-logging via a per-invite uniqueness check (if the
 * invite already has an EVENT_ATTENDED Activity, we skip it).
 */

import { inngest } from '../inngest-client';
import { prisma, Prisma } from '@partnerradar/db';
import { sendEmail, renderEmailLayout } from '@partnerradar/integrations';
import { tenant } from '@partnerradar/config';

const LOOKBACK_DAYS = 14;

export const eventAttendancePostmortem = inngest.createFunction(
  {
    id: 'event-attendance-postmortem',
    name: 'Event · reconcile attendance after end',
  },
  { cron: '*/10 * * * *' },
  async ({ step, logger }) => {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
    const floor = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);

    const candidates = await step.run('find-candidates', () =>
      prisma.evEvent.findMany({
        where: {
          endsAt: { lt: cutoff, gte: floor },
          status: { notIn: ['COMPLETED', 'CANCELED'] },
          canceledAt: null,
        },
        select: { id: true, name: true },
        take: 20,
      }),
    );
    if (candidates.length === 0) return { reconciled: 0 };
    logger.info?.(`[attendance-postmortem] reconciling ${candidates.length} events`);

    let reconciled = 0;
    for (const e of candidates) {
      await step.run(`reconcile-${e.id}`, () => reconcileEvent(e.id));
      reconciled++;
    }
    return { reconciled };
  },
);

async function reconcileEvent(eventId: string): Promise<void> {
  const event = await prisma.evEvent.findUnique({
    where: { id: eventId },
    include: {
      hosts: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });
  if (!event) return;

  const [creator, invites, primaryAssignments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: event.createdBy },
      select: { id: true, name: true, email: true },
    }),
    prisma.evInvite.findMany({
      where: {
        eventId,
        status: { in: ['CONFIRMED', 'ACCEPTED', 'CONFIRMATION_REQUESTED'] },
      },
      include: {
        partner: { select: { id: true } },
        ticketAssignments: {
          include: { ticketType: { select: { id: true, isPrimary: true } } },
        },
      },
    }),
    prisma.evTicketAssignment.findMany({
      where: { ticketType: { eventId, isPrimary: true } },
      select: { id: true, checkedInAt: true },
    }),
  ]);

  let attended = 0;
  let noShow = 0;
  let walkIn = 0;
  const partnersTouched = new Set<string>();
  const attendedPartners = new Set<string>();
  const noShowPartners = new Set<string>();

  // We only "count" attendance on the primary ticket.
  for (const inv of invites) {
    const primary = inv.ticketAssignments.find((a) => a.ticketType.isPrimary);
    if (!primary) continue;
    const isWalkIn = inv.queueTier === 'AD_HOC' && primary.checkedInAt != null;
    if (primary.checkedInAt) {
      if (isWalkIn) walkIn++;
      else attended++;
      if (inv.partnerId) {
        attendedPartners.add(inv.partnerId);
        partnersTouched.add(inv.partnerId);
      }
    } else if (inv.status === 'CONFIRMED') {
      noShow++;
      if (inv.partnerId) {
        noShowPartners.add(inv.partnerId);
        partnersTouched.add(inv.partnerId);
        // Flip the invite to NO_SHOW.
        await prisma.evInvite.update({
          where: { id: inv.id },
          data: { status: 'NO_SHOW' },
        });
      }
    }
  }

  // Log Partner activities. Guard against double-logging by looking
  // up existing EVENT_ATTENDED/EVENT_NO_SHOW activities keyed to this
  // event's public id in metadata.
  const eventMetaMatch = { path: ['eventId'], equals: eventId } as Prisma.JsonNullableFilter;
  for (const partnerId of attendedPartners) {
    const exists = await prisma.activity.findFirst({
      where: {
        partnerId,
        type: 'EVENT_ATTENDED',
        metadata: eventMetaMatch,
      },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.activity.create({
      data: {
        partnerId,
        userId: event.createdBy,
        type: 'EVENT_ATTENDED',
        body: `Attended ${event.name}`,
        metadata: { eventId } as Prisma.InputJsonValue,
      },
    });
  }
  for (const partnerId of noShowPartners) {
    const exists = await prisma.activity.findFirst({
      where: {
        partnerId,
        type: 'EVENT_NO_SHOW',
        metadata: eventMetaMatch,
      },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.activity.create({
      data: {
        partnerId,
        userId: event.createdBy,
        type: 'EVENT_NO_SHOW',
        body: `No-show at ${event.name}`,
        metadata: { eventId } as Prisma.InputJsonValue,
      },
    });
  }

  // Recompute reliability stats for every partner touched.
  for (const partnerId of partnersTouched) {
    await recomputePartnerReliability(partnerId);
  }

  // Host digest email.
  const recipients = [
    ...event.hosts.map((h) => h.user.email).filter((e): e is string => !!e),
    ...(creator?.email ? [creator.email] : []),
  ];
  if (recipients.length > 0) {
    const t = tenant();
    const subject = `Attendance summary — ${event.name}`;
    const html = renderEmailLayout({
      title: subject,
      preheader: `${attended + walkIn} attended · ${noShow} no-show · ${walkIn} walk-in`,
      bodyHtml: `<p>Hi team,</p>
<p><strong>${event.name}</strong> is in the books. Here's the recap:</p>
<ul>
  <li><strong>${attended + walkIn}</strong> attended</li>
  <li><strong>${noShow}</strong> no-show</li>
  <li><strong>${walkIn}</strong> walk-in${walkIn === 1 ? '' : 's'}</li>
  <li>${invites.length} confirmed going in</li>
</ul>
<p>Partner reliability scores have been updated automatically.</p>`,
      ctaLabel: 'Open event',
      ctaHref: `${process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? ''}/events/${eventId}`,
      footerHtml: `${t.legalName} · ${t.physicalAddress}`,
    });
    await Promise.allSettled(
      recipients.map((to) =>
        sendEmail({
          to,
          subject,
          html,
          text: `Attendance summary for ${event.name}: ${attended + walkIn} attended, ${noShow} no-show, ${walkIn} walk-in, ${invites.length} confirmed.`,
          tag: 'event-attendance-postmortem',
        }),
      ),
    );
  }

  // Summary log + flip status to COMPLETED.
  await prisma.$transaction([
    prisma.evEvent.update({
      where: { id: eventId },
      data: { status: 'COMPLETED' },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        kind: 'attendance-reconciled',
        summary: `Reconciled: ${attended + walkIn} attended, ${noShow} no-show, ${walkIn} walk-in`,
        metadata: {
          attended,
          noShow,
          walkIn,
          confirmed: invites.length,
          totalPrimaryAssignments: primaryAssignments.length,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
}

/**
 * Recompute a partner's reliability stats from raw Activity history.
 * We take a simple 90-day window so a bad-streak year ago doesn't
 * weigh forever.
 */
export async function recomputePartnerReliability(partnerId: string): Promise<void> {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const [attended, noShowCount, invitedCount, acceptedCount] = await Promise.all([
    prisma.activity.count({
      where: { partnerId, type: 'EVENT_ATTENDED', createdAt: { gte: since } },
    }),
    prisma.activity.count({
      where: { partnerId, type: 'EVENT_NO_SHOW', createdAt: { gte: since } },
    }),
    prisma.evInvite.count({
      where: {
        partnerId,
        createdAt: { gte: since },
        status: {
          in: [
            'SENT',
            'ACCEPTED',
            'CONFIRMATION_REQUESTED',
            'CONFIRMED',
            'DECLINED',
            'EXPIRED',
            'NO_SHOW',
            'AUTO_CANCELED',
          ],
        },
      },
    }),
    prisma.evInvite.count({
      where: {
        partnerId,
        createdAt: { gte: since },
        status: { in: ['ACCEPTED', 'CONFIRMATION_REQUESTED', 'CONFIRMED', 'NO_SHOW'] },
      },
    }),
  ]);

  const eventAcceptanceRate = invitedCount > 0 ? round2(acceptedCount / invitedCount) : null;
  const confirmed = attended + noShowCount;
  const eventShowRate = confirmed > 0 ? round2(attended / confirmed) : null;
  const reliabilityScore =
    eventAcceptanceRate != null && eventShowRate != null
      ? round2(50 * eventAcceptanceRate + 50 * eventShowRate)
      : null;

  await prisma.partner.update({
    where: { id: partnerId },
    data: {
      eventAcceptanceRate,
      eventShowRate,
      reliabilityScore,
    },
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
