'use server';

/**
 * Event check-in server actions (SPEC_EVENTS §11).
 *
 * The check-in flow has three entry points:
 *   • scan   — QR token from a confirmed attendee; we verify HMAC +
 *              mark the assignment checkedIn
 *   • manual — host taps an assignment from the list; same effect
 *   • walkIn — host creates an ad-hoc invite on the fly with status
 *              CONFIRMED and a set of tickets
 *
 * Auth: every action goes through `loadCanCheckIn` which gates on
 * ADMIN, MANAGER (in-market), event creator, or event host.
 *
 * Concurrency: check-in is idempotent — scanning the same QR twice
 * returns `already` rather than failing, so on-site scanner UIs can
 * be reentrant without confusion.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { verifyTicketToken } from '@/lib/events/qr';

async function loadCanCheckIn(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const event = await prisma.evEvent.findUnique({
    where: { id: eventId },
    include: { hosts: { select: { userId: true } } },
  });
  if (!event) throw new Error('NOT_FOUND');
  const role = session.user.role;
  const markets = session.user.markets ?? [];
  if (role !== 'ADMIN' && !markets.includes(event.marketId)) throw new Error('FORBIDDEN');
  const isMgrPlus = role === 'MANAGER' || role === 'ADMIN';
  const isHost = event.hosts.some((h) => h.userId === session.user.id);
  const isCreator = event.createdBy === session.user.id;
  if (!isMgrPlus && !isCreator && !isHost) throw new Error('FORBIDDEN');
  return { event, userId: session.user.id };
}

export interface CheckInResult {
  ok: boolean;
  status: 'checked-in' | 'already' | 'wrong-event' | 'not-found' | 'not-confirmed' | 'bad-token';
  assignmentId?: string;
  inviteId?: string;
  inviteeName?: string;
  ticketName?: string;
}

export async function scanCheckIn(args: {
  eventId: string;
  token: string;
}): Promise<CheckInResult> {
  const { event, userId } = await loadCanCheckIn(args.eventId);
  const parsed = verifyTicketToken(event.id, args.token);
  if (!parsed.ok) return { ok: false, status: 'bad-token' };

  const assignment = await prisma.evTicketAssignment.findUnique({
    where: { id: parsed.assignmentId },
    include: {
      ticketType: { select: { id: true, name: true, eventId: true } },
      invite: {
        select: {
          id: true,
          status: true,
          adHocName: true,
          partner: { select: { companyName: true } },
        },
      },
    },
  });
  if (!assignment) return { ok: false, status: 'not-found' };
  if (assignment.ticketType.eventId !== event.id) {
    return { ok: false, status: 'wrong-event' };
  }
  if (assignment.status !== 'CONFIRMED') {
    return { ok: false, status: 'not-confirmed' };
  }

  const name = assignment.invite.partner?.companyName ?? assignment.invite.adHocName ?? 'Guest';

  if (assignment.checkedInAt) {
    return {
      ok: true,
      status: 'already',
      assignmentId: assignment.id,
      inviteId: assignment.inviteId,
      inviteeName: name,
      ticketName: assignment.ticketType.name,
    };
  }

  await prisma.$transaction([
    prisma.evTicketAssignment.update({
      where: { id: assignment.id },
      data: { checkedInAt: new Date(), checkedInBy: userId },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId: event.id,
        userId,
        kind: 'checked-in',
        summary: `${name} checked in (${assignment.ticketType.name})`,
        metadata: {
          inviteId: assignment.inviteId,
          assignmentId: assignment.id,
          method: 'qr-scan',
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath(`/events/${event.id}/check-in`);
  return {
    ok: true,
    status: 'checked-in',
    assignmentId: assignment.id,
    inviteId: assignment.inviteId,
    inviteeName: name,
    ticketName: assignment.ticketType.name,
  };
}

export async function manualCheckIn(args: {
  eventId: string;
  assignmentId: string;
}): Promise<CheckInResult> {
  const { event, userId } = await loadCanCheckIn(args.eventId);
  const assignment = await prisma.evTicketAssignment.findUnique({
    where: { id: args.assignmentId },
    include: {
      ticketType: { select: { id: true, name: true, eventId: true } },
      invite: {
        select: {
          id: true,
          status: true,
          adHocName: true,
          partner: { select: { companyName: true } },
        },
      },
    },
  });
  if (!assignment || assignment.ticketType.eventId !== event.id) {
    return { ok: false, status: 'not-found' };
  }
  if (assignment.status !== 'CONFIRMED') {
    return { ok: false, status: 'not-confirmed' };
  }
  const name = assignment.invite.partner?.companyName ?? assignment.invite.adHocName ?? 'Guest';
  if (assignment.checkedInAt) {
    return {
      ok: true,
      status: 'already',
      assignmentId: assignment.id,
      inviteId: assignment.inviteId,
      inviteeName: name,
      ticketName: assignment.ticketType.name,
    };
  }
  await prisma.$transaction([
    prisma.evTicketAssignment.update({
      where: { id: assignment.id },
      data: { checkedInAt: new Date(), checkedInBy: userId },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId: event.id,
        userId,
        kind: 'checked-in',
        summary: `${name} checked in (${assignment.ticketType.name})`,
        metadata: {
          inviteId: assignment.inviteId,
          assignmentId: assignment.id,
          method: 'manual',
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath(`/events/${event.id}/check-in`);
  return {
    ok: true,
    status: 'checked-in',
    assignmentId: assignment.id,
    inviteId: assignment.inviteId,
    inviteeName: name,
    ticketName: assignment.ticketType.name,
  };
}

/**
 * Walk-in add: someone showed up unannounced, host logs them manually.
 * Capacity check is soft — we warn in the result but still allow the
 * add (organizers can override on site).
 */
export async function walkInAdd(args: {
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  ticketTypeIds: string[];
  overrideCapacity?: boolean;
}): Promise<{
  ok: boolean;
  reason?: 'no-capacity' | 'no-tickets' | 'ticket-not-in-event';
  inviteId?: string;
}> {
  const { event, userId } = await loadCanCheckIn(args.eventId);
  if (!args.name.trim()) return { ok: false, reason: 'no-tickets' };
  if (args.ticketTypeIds.length === 0) return { ok: false, reason: 'no-tickets' };

  const ticketTypes = await prisma.evTicketType.findMany({
    where: { id: { in: args.ticketTypeIds } },
    select: { id: true, eventId: true, name: true, capacity: true, internalAllocation: true },
  });
  if (ticketTypes.some((tt) => tt.eventId !== event.id)) {
    return { ok: false, reason: 'ticket-not-in-event' };
  }

  // Soft capacity check.
  if (!args.overrideCapacity) {
    for (const tt of ticketTypes) {
      const taken = await prisma.evTicketAssignment.aggregate({
        where: { ticketTypeId: tt.id, status: { in: ['TENTATIVE', 'CONFIRMED'] } },
        _sum: { quantity: true },
      });
      const available = tt.capacity - (taken._sum.quantity ?? 0) - tt.internalAllocation;
      if (available <= 0) return { ok: false, reason: 'no-capacity' };
    }
  }

  // Pick a queueOrder past any existing queued entries.
  const maxQueued = await prisma.evInvite.aggregate({
    where: { eventId: event.id },
    _max: { queueOrder: true },
  });

  const invite = await prisma.evInvite.create({
    data: {
      eventId: event.id,
      queueTier: 'AD_HOC',
      status: 'CONFIRMED',
      respondedAt: new Date(),
      confirmedAt: new Date(),
      queueOrder: (maxQueued._max.queueOrder ?? 0) + 1000,
      adHocName: args.name.trim(),
      adHocEmail: args.email?.trim() || null,
      adHocPhone: args.phone?.trim() || null,
      ticketAssignments: {
        create: ticketTypes.map((tt) => ({
          ticketTypeId: tt.id,
          quantity: 1,
          status: 'CONFIRMED',
          checkedInAt: new Date(),
          checkedInBy: userId,
        })),
      },
    },
  });

  await prisma.evActivityLogEntry.create({
    data: {
      eventId: event.id,
      userId,
      kind: 'walk-in-added',
      summary: `Walk-in: ${args.name.trim()} (${ticketTypes.map((t) => t.name).join(', ')})`,
      metadata: {
        inviteId: invite.id,
        ticketTypeIds: args.ticketTypeIds,
      } as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/events/${event.id}/check-in`);
  revalidatePath(`/events/${event.id}`);
  return { ok: true, inviteId: invite.id };
}

export async function undoCheckIn(args: {
  eventId: string;
  assignmentId: string;
}): Promise<{ ok: boolean }> {
  const { event, userId } = await loadCanCheckIn(args.eventId);
  const existing = await prisma.evTicketAssignment.findUnique({
    where: { id: args.assignmentId },
    include: {
      ticketType: { select: { eventId: true, name: true } },
      invite: { select: { partner: { select: { companyName: true } }, adHocName: true } },
    },
  });
  if (!existing || existing.ticketType.eventId !== event.id) return { ok: false };
  if (!existing.checkedInAt) return { ok: true }; // nothing to undo
  const name = existing.invite.partner?.companyName ?? existing.invite.adHocName ?? 'Guest';
  await prisma.$transaction([
    prisma.evTicketAssignment.update({
      where: { id: existing.id },
      data: { checkedInAt: null, checkedInBy: null },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId: event.id,
        userId,
        kind: 'check-in-undone',
        summary: `Undid check-in for ${name} (${existing.ticketType.name})`,
      },
    }),
  ]);
  revalidatePath(`/events/${event.id}/check-in`);
  return { ok: true };
}
