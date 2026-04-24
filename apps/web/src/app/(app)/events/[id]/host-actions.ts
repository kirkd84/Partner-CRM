'use server';

/**
 * Host + sub-event actions.
 *
 * Hosts consume tickets up-front (their assignments are created as
 * CONFIRMED immediately) so capacity math reflects internal allocation
 * before any external invites go out.
 *
 * Sub-events are calendar-worthy sibling events (Setup, Pre-Dinner,
 * Teardown). Each optionally scopes its invitee pool (internal-only,
 * all confirmed, holders of specific dependent ticket).
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import {
  regenerateSubEventSetupReminders,
  cancelSubEventSetupReminders,
} from '@/lib/events/reminder-schedule';

async function loadCanEdit(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const event = await prisma.evEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      marketId: true,
      createdBy: true,
      status: true,
      canceledAt: true,
      hosts: { select: { userId: true } },
    },
  });
  if (!event) throw new Error('NOT_FOUND');
  const markets = session.user.markets ?? [];
  const role = session.user.role;
  if (role !== 'ADMIN' && !markets.includes(event.marketId)) throw new Error('FORBIDDEN');
  const isMgrPlus = role === 'MANAGER' || role === 'ADMIN';
  const isCreator = event.createdBy === session.user.id;
  const isHost = event.hosts.some((h) => h.userId === session.user.id);
  if (!isMgrPlus && !isCreator && !isHost) throw new Error('FORBIDDEN');
  return { session, event };
}

// ─── Hosts ──────────────────────────────────────────────────────────

export async function addHost(
  eventId: string,
  input: { userId: string; role?: string; ticketTypeIds: string[] },
): Promise<void> {
  const { session } = await loadCanEdit(eventId);
  if (!input.userId) throw new Error('Pick a user');

  const ticketTypes = await prisma.evTicketType.findMany({
    where: { id: { in: input.ticketTypeIds }, eventId },
    select: { id: true, name: true },
  });
  if (ticketTypes.length !== input.ticketTypeIds.length) {
    throw new Error('Some ticket types not found');
  }

  await prisma.$transaction(async (tx) => {
    const host = await tx.evHost.create({
      data: {
        eventId,
        userId: input.userId,
        role: input.role?.trim() || null,
        ticketTypeIds: input.ticketTypeIds as unknown as Prisma.InputJsonValue,
      },
    });

    // Hosts need an EvInvite row so ticket assignments can hang off it.
    // We mark them CONFIRMED right away — hosts don't RSVP to themselves.
    const invite = await tx.evInvite
      .upsert({
        where: { eventId_partnerId: { eventId, partnerId: `__host__${host.id}` } },
        create: {
          eventId,
          partnerId: null,
          adHocName: session.user.name ?? 'Host',
          queueTier: 'AD_HOC',
          queueOrder: -1000, // hosts sort to top
          status: 'CONFIRMED',
          confirmedAt: new Date(),
        },
        update: {},
      })
      .catch(async () => {
        // Composite unique has a null partnerId edge case; create directly.
        return tx.evInvite.create({
          data: {
            eventId,
            partnerId: null,
            adHocName: `Host`,
            queueTier: 'AD_HOC',
            queueOrder: -1000,
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
        });
      });

    for (const tt of ticketTypes) {
      await tx.evTicketAssignment.upsert({
        where: { inviteId_ticketTypeId: { inviteId: invite.id, ticketTypeId: tt.id } },
        create: {
          inviteId: invite.id,
          ticketTypeId: tt.id,
          quantity: 1,
          status: 'CONFIRMED',
        },
        update: { status: 'CONFIRMED', quantity: 1 },
      });
    }

    await tx.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'host-added',
        summary: `Added ${input.role ?? 'host'} · ${ticketTypes.map((t) => t.name).join(', ') || 'no tickets'}`,
      },
    });
  });

  revalidatePath(`/events/${eventId}`);
}

export async function removeHost(eventId: string, hostId: string): Promise<void> {
  const { session } = await loadCanEdit(eventId);
  const host = await prisma.evHost.findUnique({ where: { id: hostId } });
  if (!host || host.eventId !== eventId) throw new Error('NOT_FOUND');

  await prisma.$transaction([
    prisma.evHost.delete({ where: { id: hostId } }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'host-removed',
        summary: `Removed host`,
      },
    }),
  ]);
  revalidatePath(`/events/${eventId}`);
}

// ─── Sub-events ─────────────────────────────────────────────────────

export interface SubEventInput {
  kind: 'SETUP' | 'PRE_EVENT' | 'MAIN' | 'DINNER' | 'POST_EVENT' | 'TEARDOWN' | 'CUSTOM';
  name: string;
  venueName?: string;
  venueAddress?: string;
  startsAt: string;
  endsAt: string;
  invitationScope: 'INTERNAL_ONLY' | 'ALL_CONFIRMED' | 'DEPENDENT_TICKET_HOLDERS' | 'CUSTOM';
  dependentTicketTypeId?: string | null;
}

export async function createSubEvent(eventId: string, input: SubEventInput): Promise<void> {
  const { session } = await loadCanEdit(eventId);
  if (!input.name.trim()) throw new Error('Name required');
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (end <= start) throw new Error('End must be after start');
  if (input.invitationScope === 'DEPENDENT_TICKET_HOLDERS' && !input.dependentTicketTypeId) {
    throw new Error('Pick which dependent ticket this sub-event is for');
  }

  const [created] = await prisma.$transaction([
    prisma.evSubEvent.create({
      data: {
        eventId,
        kind: input.kind,
        name: input.name.trim(),
        venueName: input.venueName?.trim() || null,
        venueAddress: input.venueAddress?.trim() || null,
        startsAt: start,
        endsAt: end,
        invitationScope: input.invitationScope,
        dependentTicketTypeId:
          input.invitationScope === 'DEPENDENT_TICKET_HOLDERS'
            ? (input.dependentTicketTypeId ?? null)
            : null,
      },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'subevent-added',
        summary: `Added sub-event "${input.name.trim()}" (${input.kind})`,
      },
    }),
  ]);
  // Schedule SETUP host reminders (T-4h + T-1h) — no-op for non-SETUP.
  if (created.kind === 'SETUP') {
    await regenerateSubEventSetupReminders(created.id).catch((err) =>
      console.warn('[sub-event] setup reminder schedule failed', err),
    );
  }
  revalidatePath(`/events/${eventId}`);
}

export async function deleteSubEvent(eventId: string, subEventId: string): Promise<void> {
  const { session } = await loadCanEdit(eventId);
  const sub = await prisma.evSubEvent.findUnique({ where: { id: subEventId } });
  if (!sub || sub.eventId !== eventId) throw new Error('NOT_FOUND');

  // Cancel pending setup reminders BEFORE the FK cascade takes them.
  await cancelSubEventSetupReminders(subEventId).catch(() => null);

  await prisma.$transaction([
    prisma.evSubEvent.delete({ where: { id: subEventId } }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'subevent-removed',
        summary: `Removed sub-event "${sub.name}"`,
      },
    }),
  ]);
  revalidatePath(`/events/${eventId}`);
}
