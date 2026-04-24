/**
 * Event cascade + reminder scheduler skeletons.
 *
 * Real cascade logic (primary release promotes next-up, dependent
 * batch-offer, etc.) is specced in SPEC_EVENTS §5. For EV-1/4 we ship
 * a minimal implementation that handles the most common flow — primary
 * ticket released from a decline/cancel → next QUEUED invite gets sent
 * via the same dispatcher.
 *
 * Batch-offer for parking (§4.4) is intentionally stubbed for now —
 * unlocks fully in EV-6 when the /claim page + atomic SELECT FOR
 * UPDATE SKIP LOCKED go in.
 */

import { inngest } from '../inngest-client';
import { prisma } from '@partnerradar/db';
import { dispatchEventInvite } from '@/lib/events/dispatch-invite';

export const eventTicketReleased = inngest.createFunction(
  {
    id: 'event-ticket-released',
    name: 'Event · cascade on ticket release',
    concurrency: { key: 'event.data.eventId', limit: 1 },
  },
  { event: 'partner-portal/event.ticket-released' },
  async ({ event, step }) => {
    const eventId = String(event.data?.eventId ?? '');
    const freed = (event.data?.ticketTypeIds ?? []) as string[];
    if (!eventId || freed.length === 0) return { ok: false };

    return step.run('promote', async () => {
      const evt = await prisma.evEvent.findUnique({
        where: { id: eventId },
        include: {
          ticketTypes: { where: { isPrimary: true }, select: { id: true, capacity: true } },
        },
      });
      if (!evt) return { ok: false, error: 'event_not_found' };
      const primary = evt.ticketTypes[0];
      if (!primary) return { ok: false, error: 'no_primary_ticket' };

      // We only handle primary release for now. Dependent batch-offer
      // (parking) ships in EV-6.
      if (!freed.includes(primary.id)) {
        return { ok: true, skipped: 'not_primary' };
      }

      // Capacity snapshot.
      const taken = await prisma.evTicketAssignment.aggregate({
        where: {
          ticketTypeId: primary.id,
          status: { in: ['TENTATIVE', 'CONFIRMED'] },
        },
        _sum: { quantity: true },
      });
      const available = primary.capacity - (taken._sum.quantity ?? 0);
      if (available <= 0) return { ok: true, skipped: 'no_capacity' };

      // Promote the next QUEUED invite.
      const next = await prisma.evInvite.findFirst({
        where: { eventId, status: 'QUEUED' },
        orderBy: { queueOrder: 'asc' },
      });
      if (!next) return { ok: true, skipped: 'queue_empty' };

      const now = new Date();
      const hoursUntil = (evt.startsAt.getTime() - now.getTime()) / (3600 * 1000);
      const windowHours =
        hoursUntil >= 24 * 30
          ? 5 * 24
          : hoursUntil >= 24 * 14
            ? 3 * 24
            : hoursUntil >= 24 * 7
              ? 2 * 24
              : hoursUntil >= 24 * 3
                ? 24
                : hoursUntil >= 24
                  ? 6
                  : 2;

      await prisma.$transaction([
        prisma.evInvite.update({
          where: { id: next.id },
          data: {
            status: 'SENT',
            sentAt: now,
            expiresAt: new Date(now.getTime() + windowHours * 3600 * 1000),
          },
        }),
        prisma.evRsvpEvent.create({
          data: {
            inviteId: next.id,
            kind: 'invited',
            actorType: 'system',
          },
        }),
        prisma.evActivityLogEntry.create({
          data: {
            eventId,
            kind: 'cascade-promoted',
            summary: `Promoted next invite after ticket release · ${windowHours}h window`,
          },
        }),
      ]);

      await dispatchEventInvite({ inviteId: next.id }).catch((err) => {
        console.warn('[cascade] dispatch failed', err);
      });

      return { ok: true, promoted: next.id, windowHours };
    });
  },
);

/**
 * 5-minute scheduler tick — expires stale SENT invites (past
 * expiresAt) and fires the cascade for the freed tickets.
 */
export const eventExpireTick = inngest.createFunction(
  { id: 'event-expire-tick', name: 'Event · expire stale invites' },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const expired = await step.run('find-expired', async () =>
      prisma.evInvite.findMany({
        where: {
          status: 'SENT',
          expiresAt: { lt: new Date() },
        },
        include: {
          ticketAssignments: { select: { ticketTypeId: true } },
        },
        take: 50,
      }),
    );

    let freedCount = 0;
    for (const inv of expired) {
      const releasedTypes = [...new Set(inv.ticketAssignments.map((a) => a.ticketTypeId))];
      await step.run(`expire-${inv.id}`, async () => {
        await prisma.$transaction([
          prisma.evInvite.update({
            where: { id: inv.id },
            data: { status: 'EXPIRED' },
          }),
          prisma.evTicketAssignment.updateMany({
            where: { inviteId: inv.id },
            data: { status: 'RELEASED' },
          }),
          prisma.evRsvpEvent.create({
            data: {
              inviteId: inv.id,
              kind: 'expired',
              actorType: 'system',
            },
          }),
        ]);
      });
      if (releasedTypes.length > 0) {
        freedCount += releasedTypes.length;
        await inngest.send({
          name: 'partner-portal/event.ticket-released',
          data: { eventId: inv.eventId, ticketTypeIds: releasedTypes },
        });
      }
    }

    return { expired: expired.length, cascadesQueued: freedCount };
  },
);
