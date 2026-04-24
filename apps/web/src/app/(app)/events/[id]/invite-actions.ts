'use server';

/**
 * Invite queue + batch-send actions.
 *
 * Queue mechanics:
 *   • New invites land with queueOrder = max + 1000 (leaves slack for
 *     drag-reorder without big renumbers).
 *   • Reorder sends a full list of ids in new order; we renumber
 *     1000, 2000, 3000... so drag-drop always has headroom.
 *   • Removing only works for QUEUED invites — once sent, they're part
 *     of the cascade and need to cancel formally.
 *
 * Batch send: calculates capacity, takes top N QUEUED, marks SENT,
 * sets expiresAt per §2.5 proximity table, dispatches email + SMS
 * (dispatcher handles consent + quiet hours + CAN-SPAM footer).
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';

async function loadCanEdit(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const event = await prisma.evEvent.findUnique({
    where: { id: eventId },
    include: {
      hosts: { select: { userId: true } },
      ticketTypes: { where: { isPrimary: true }, select: { id: true, capacity: true, name: true } },
    },
  });
  if (!event) throw new Error('NOT_FOUND');
  const markets = session.user.markets ?? [];
  const role = session.user.role;
  if (role !== 'ADMIN' && !markets.includes(event.marketId)) throw new Error('FORBIDDEN');
  const isMgrPlus = role === 'MANAGER' || role === 'ADMIN';
  const isHost = event.hosts.some((h) => h.userId === session.user.id);
  const isCreator = event.createdBy === session.user.id;
  if (!isMgrPlus && !isCreator && !isHost) throw new Error('FORBIDDEN');
  return { session, event };
}

export interface AddPartnerInvitesInput {
  partnerIds: string[];
  plusOneDefault?: boolean;
}

export async function addPartnerInvites(
  eventId: string,
  input: AddPartnerInvitesInput,
): Promise<{ added: number; skipped: number }> {
  const { session, event } = await loadCanEdit(eventId);
  const primary = event.ticketTypes[0];
  if (!primary) throw new Error('Add a primary ticket type first');

  const maxOrder = await prisma.evInvite.aggregate({
    where: { eventId },
    _max: { queueOrder: true },
  });
  let nextOrder = (maxOrder._max.queueOrder ?? 0) + 1000;

  let added = 0;
  let skipped = 0;
  for (const partnerId of input.partnerIds) {
    try {
      const created = await prisma.evInvite.create({
        data: {
          eventId,
          partnerId,
          queueOrder: nextOrder,
          queueTier: 'PRIMARY',
          status: 'QUEUED',
          plusOneAllowed: input.plusOneDefault ?? event.defaultPlusOnesAllowed,
        },
      });
      // Tentative primary assignment — counts toward capacity math but
      // doesn't confirm until RSVP.
      await prisma.evTicketAssignment.create({
        data: {
          inviteId: created.id,
          ticketTypeId: primary.id,
          quantity: 1,
          status: 'TENTATIVE',
        },
      });
      added++;
      nextOrder += 1000;
    } catch {
      // Unique violation — partner already in queue.
      skipped++;
    }
  }

  if (added > 0) {
    await prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'invites-added',
        summary: `Added ${added} partner${added === 1 ? '' : 's'} to queue${skipped > 0 ? ` (${skipped} skipped — already queued)` : ''}`,
      },
    });
  }

  revalidatePath(`/events/${eventId}`);
  return { added, skipped };
}

export interface AddAdHocInviteInput {
  name: string;
  email?: string;
  phone?: string;
  plusOneAllowed?: boolean;
}

export async function addAdHocInvite(eventId: string, input: AddAdHocInviteInput): Promise<void> {
  const { session, event } = await loadCanEdit(eventId);
  if (!input.name.trim()) throw new Error('Name required');
  if (!input.email?.trim() && !input.phone?.trim()) {
    throw new Error('Need an email or phone so we can actually reach them');
  }
  const primary = event.ticketTypes[0];
  if (!primary) throw new Error('Add a primary ticket type first');

  const maxOrder = await prisma.evInvite.aggregate({
    where: { eventId },
    _max: { queueOrder: true },
  });

  const created = await prisma.evInvite.create({
    data: {
      eventId,
      partnerId: null,
      adHocName: input.name.trim(),
      adHocEmail: input.email?.trim() || null,
      adHocPhone: input.phone?.trim() || null,
      queueOrder: (maxOrder._max.queueOrder ?? 0) + 1000,
      queueTier: 'AD_HOC',
      status: 'QUEUED',
      plusOneAllowed: input.plusOneAllowed ?? event.defaultPlusOnesAllowed,
    },
  });
  await prisma.evTicketAssignment.create({
    data: {
      inviteId: created.id,
      ticketTypeId: primary.id,
      quantity: 1,
      status: 'TENTATIVE',
    },
  });
  await prisma.evActivityLogEntry.create({
    data: {
      eventId,
      userId: session.user.id,
      kind: 'ad-hoc-added',
      summary: `Added ad-hoc invitee "${input.name.trim()}"`,
    },
  });
  revalidatePath(`/events/${eventId}`);
}

export async function reorderQueue(eventId: string, inviteIds: string[]): Promise<void> {
  const { session } = await loadCanEdit(eventId);
  // Only renumber rows that are still QUEUED (can't reorder sent invites).
  const queued = await prisma.evInvite.findMany({
    where: { eventId, status: 'QUEUED' },
    select: { id: true },
  });
  const queuedSet = new Set(queued.map((r) => r.id));
  const valid = inviteIds.filter((id) => queuedSet.has(id));

  await prisma.$transaction(
    valid.map((id, idx) =>
      prisma.evInvite.update({
        where: { id },
        data: { queueOrder: (idx + 1) * 1000 },
      }),
    ),
  );
  void session;
  revalidatePath(`/events/${eventId}`);
}

export async function removeInvite(eventId: string, inviteId: string): Promise<void> {
  const { session } = await loadCanEdit(eventId);
  const invite = await prisma.evInvite.findUnique({
    where: { id: inviteId },
    select: { id: true, eventId: true, status: true, partnerId: true, adHocName: true },
  });
  if (!invite || invite.eventId !== eventId) throw new Error('NOT_FOUND');
  if (invite.status !== 'QUEUED') {
    throw new Error(
      'Only queued invites can be removed. Sent invites need to decline or cancel through the RSVP flow.',
    );
  }
  await prisma.$transaction([
    prisma.evInvite.delete({ where: { id: inviteId } }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'invite-removed',
        summary: `Removed ${invite.partnerId ? 'partner' : 'ad-hoc'} "${invite.adHocName ?? invite.partnerId}" from queue`,
      },
    }),
  ]);
  revalidatePath(`/events/${eventId}`);
}

export async function setInvitePlusOne(
  eventId: string,
  inviteId: string,
  plusOneAllowed: boolean,
): Promise<void> {
  await loadCanEdit(eventId);
  await prisma.evInvite.update({
    where: { id: inviteId },
    data: { plusOneAllowed },
  });
  revalidatePath(`/events/${eventId}`);
}

// ─── Batch send ─────────────────────────────────────────────────────

/**
 * Proximity-aware response-window defaults per SPEC §2.5. Returns
 * hours — the caller multiplies by 3600000 to get ms.
 */
export function proximityWindowHours(eventStartsAt: Date, now: Date = new Date()): number {
  const ms = eventStartsAt.getTime() - now.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  if (days >= 30) return 5 * 24;
  if (days >= 14) return 3 * 24;
  if (days >= 7) return 2 * 24;
  if (days >= 3) return 24;
  if (days >= 1) return 6;
  return 2; // < 24 hours
}

export async function sendBatch(eventId: string): Promise<{
  sent: number;
  skipped: number;
  firstError?: string;
}> {
  const { session, event } = await loadCanEdit(eventId);
  if (event.canceledAt) throw new Error('Event is canceled');
  const primary = event.ticketTypes[0];
  if (!primary) throw new Error('Add a primary ticket type first');

  // Capacity snapshot.
  const taken = await prisma.evTicketAssignment.aggregate({
    where: {
      ticketTypeId: primary.id,
      status: { in: ['TENTATIVE', 'CONFIRMED'] },
    },
    _sum: { quantity: true },
  });
  const currentTaken = taken._sum.quantity ?? 0;

  const queued = await prisma.evInvite.findMany({
    where: { eventId, status: 'QUEUED' },
    orderBy: { queueOrder: 'asc' },
    include: {
      partner: { select: { id: true, companyName: true, marketId: true } },
      ticketAssignments: true,
    },
  });

  // Capacity each invite would claim (plus-ones double up on primary).
  let remaining = Math.max(0, primary.capacity - currentTaken) + queued.length; // re-evaluate below
  remaining = Math.max(0, primary.capacity - currentTaken);

  const now = new Date();
  const windowHours = proximityWindowHours(event.startsAt, now);
  const expiresAt = new Date(now.getTime() + windowHours * 3600 * 1000);

  let sent = 0;
  let skipped = 0;
  let firstError: string | undefined;

  for (const inv of queued) {
    const consumption = inv.plusOneAllowed ? 2 : 1;
    if (consumption > remaining) {
      skipped++;
      continue;
    }

    // Flip to SENT + set expiresAt. (Actual send wiring in dispatch
    // happens below — for EV-4 we don't block on SMS; email sends via
    // Resend if configured, otherwise dry-run log.)
    try {
      await prisma.$transaction([
        prisma.evInvite.update({
          where: { id: inv.id },
          data: {
            status: 'SENT',
            sentAt: now,
            expiresAt,
          },
        }),
        prisma.evRsvpEvent.create({
          data: {
            inviteId: inv.id,
            kind: 'invited',
            actorType: 'organizer',
            actorId: session.user.id,
          },
        }),
      ]);

      // Dispatch via email (skipped gracefully if RESEND_API_KEY missing).
      try {
        const { dispatchEventInvite } = await import('@/lib/events/dispatch-invite');
        await dispatchEventInvite({ inviteId: inv.id });
      } catch (err) {
        if (!firstError) firstError = err instanceof Error ? err.message : String(err);
      }

      remaining -= consumption;
      sent++;
    } catch (err) {
      if (!firstError) firstError = err instanceof Error ? err.message : String(err);
      skipped++;
    }
  }

  if (sent > 0) {
    await prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'batch-sent',
        summary: `Sent ${sent} invite${sent === 1 ? '' : 's'}; response window ${windowHours}h`,
        metadata: { sent, skipped, windowHours } as Prisma.InputJsonValue,
      },
    });
  }

  revalidatePath(`/events/${eventId}`);
  return { sent, skipped, firstError };
}
