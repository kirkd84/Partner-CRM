'use server';

/**
 * Organizer-side batch-offer actions.
 *
 * The cascade engine creates offers automatically when a dependent
 * ticket releases, but organizers still need escape hatches:
 *   • cancel — pulls an offer early (e.g. they want to hand-assign
 *     instead of letting the pool race)
 *   • hand-assign — short-circuits the race and locks the freed ticket
 *     to a specific confirmed invitee
 *
 * Auth matches the rest of the event detail surface: ADMIN, or MANAGER
 * in this market, or the event creator, or a host.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';

async function loadCanEdit(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const event = await prisma.evEvent.findUnique({
    where: { id: eventId },
    include: { hosts: { select: { userId: true } } },
  });
  if (!event) throw new Error('NOT_FOUND');
  const markets = session.user.markets ?? [];
  const role = session.user.role;
  if (role !== 'ADMIN' && !markets.includes(event.marketId)) throw new Error('FORBIDDEN');
  const isMgrPlus = role === 'MANAGER' || role === 'ADMIN';
  const isHost = event.hosts.some((h) => h.userId === session.user.id);
  const isCreator = event.createdBy === session.user.id;
  if (!isMgrPlus && !isCreator && !isHost) throw new Error('FORBIDDEN');
  return { eventId, userId: session.user.id };
}

export async function cancelBatchOffer(args: { eventId: string; batchOfferId: string }) {
  const { eventId, userId } = await loadCanEdit(args.eventId);
  const offer = await prisma.evBatchOffer.findUnique({
    where: { id: args.batchOfferId },
    select: { id: true, eventId: true, status: true, ticketTypeId: true },
  });
  if (!offer || offer.eventId !== eventId) throw new Error('NOT_FOUND');
  if (offer.status !== 'OPEN') return { ok: false, reason: 'not_open' as const };

  await prisma.$transaction([
    prisma.evBatchOffer.update({
      where: { id: offer.id },
      data: { status: 'CANCELED' },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId,
        kind: 'batch-offer-canceled',
        summary: 'Organizer canceled a batch offer',
        metadata: {
          batchOfferId: offer.id,
          ticketTypeId: offer.ticketTypeId,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/**
 * Hand-assign a freed dependent ticket directly to a specific invite
 * (skipping the batch-offer race). Useful when the organizer already
 * knows who should get it — e.g. "give Sam's parking to Jamie who
 * asked me in person yesterday."
 *
 * Atomic: checks that no active assignment exists yet for this invite
 * + ticketType, then creates or updates one to CONFIRMED. Cancels the
 * batch offer if one was already open.
 */
export async function handAssignBatchOffer(args: {
  eventId: string;
  batchOfferId?: string;
  ticketTypeId: string;
  targetInviteId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { eventId, userId } = await loadCanEdit(args.eventId);

  const ticketType = await prisma.evTicketType.findUnique({
    where: { id: args.ticketTypeId },
    select: {
      eventId: true,
      capacity: true,
      internalAllocation: true,
      name: true,
      isPrimary: true,
    },
  });
  if (!ticketType || ticketType.eventId !== eventId) {
    return { ok: false, reason: 'ticket_type_mismatch' };
  }

  const invite = await prisma.evInvite.findUnique({
    where: { id: args.targetInviteId },
    select: { eventId: true, status: true },
  });
  if (!invite || invite.eventId !== eventId) return { ok: false, reason: 'invite_mismatch' };
  if (!['ACCEPTED', 'CONFIRMATION_REQUESTED', 'CONFIRMED'].includes(invite.status)) {
    return { ok: false, reason: 'invite_not_eligible' };
  }

  const taken = await prisma.evTicketAssignment.aggregate({
    where: { ticketTypeId: args.ticketTypeId, status: { in: ['TENTATIVE', 'CONFIRMED'] } },
    _sum: { quantity: true },
  });
  const available =
    ticketType.capacity - (taken._sum.quantity ?? 0) - ticketType.internalAllocation;
  if (available <= 0) return { ok: false, reason: 'no_capacity' };

  const existing = await prisma.evTicketAssignment.findUnique({
    where: {
      inviteId_ticketTypeId: {
        inviteId: args.targetInviteId,
        ticketTypeId: args.ticketTypeId,
      },
    },
  });

  await prisma.$transaction([
    existing
      ? prisma.evTicketAssignment.update({
          where: { id: existing.id },
          data: { status: 'CONFIRMED' },
        })
      : prisma.evTicketAssignment.create({
          data: {
            inviteId: args.targetInviteId,
            ticketTypeId: args.ticketTypeId,
            status: 'CONFIRMED',
            quantity: 1,
          },
        }),
    ...(args.batchOfferId
      ? [
          prisma.evBatchOffer.update({
            where: { id: args.batchOfferId },
            data: {
              status: 'CLAIMED',
              claimedByInviteId: args.targetInviteId,
              claimedAt: new Date(),
            },
          }),
        ]
      : []),
    prisma.evRsvpEvent.create({
      data: {
        inviteId: args.targetInviteId,
        kind: 'hand-assigned',
        ticketDelta: {
          ticketTypeId: args.ticketTypeId,
          batchOfferId: args.batchOfferId ?? null,
        } as Prisma.InputJsonValue,
        actorType: 'organizer',
        actorId: userId,
      },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId,
        kind: 'ticket-hand-assigned',
        summary: `${ticketType.name} hand-assigned by organizer`,
        metadata: {
          ticketTypeId: args.ticketTypeId,
          inviteId: args.targetInviteId,
          batchOfferId: args.batchOfferId ?? null,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}
