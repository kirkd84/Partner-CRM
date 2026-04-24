/**
 * Inngest jobs for ticket cascade + stale-invite expiry.
 *
 * The real cascade brains live in `lib/events/cascade.ts` —
 * `handleTicketRelease` is the entry point. This file just wraps those
 * calls in Inngest function definitions with proper concurrency keys
 * and cron schedules, and exposes a batch-offer expiry tick.
 *
 * Concurrency note: we lock on `event.data.eventId` for both primary
 * cascade and batch-offer expiry so two releases on the same event
 * can't race into double-promoting the same queued invite.
 */

import { inngest } from '../inngest-client';
import { handleTicketRelease, expireStaleBatchOffers } from '@/lib/events/cascade';
import { prisma } from '@partnerradar/db';

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

    const result = await step.run('cascade', () => handleTicketRelease(eventId, freed));
    return { ok: true, ...result };
  },
);

/**
 * 5-minute scheduler tick — expires stale SENT invites (past
 * expiresAt), releases their tickets, and fires the cascade engine
 * for each released type. Also expires stale batch offers.
 */
export const eventExpireTick = inngest.createFunction(
  { id: 'event-expire-tick', name: 'Event · expire stale invites + offers' },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const expired = await step.run('find-expired-invites', async () =>
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

    const offers = await step.run('expire-batch-offers', () => expireStaleBatchOffers());

    return {
      invitesExpired: expired.length,
      cascadesQueued: freedCount,
      batchOffersExpired: offers.expired,
    };
  },
);
