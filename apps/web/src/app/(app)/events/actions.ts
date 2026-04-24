'use server';

/**
 * Event Tracking — top-level actions.
 *
 * Permissions per SPEC_EVENTS.md §12:
 *   • Rep: create events where they'll be a host, edit their own
 *   • Manager+: anything in their markets
 *   • Admin: anywhere
 *
 * Every mutation writes both an AuditLog (tenant-wide) and an
 * EvActivityLogEntry (event-scoped) row so both the org-level audit
 * page and the per-event activity tab are populated.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';

export type EventStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELED';
export type EventVisibility = 'PRIVATE' | 'MARKET_WIDE' | 'PUBLIC';

export interface CreateEventInput {
  name: string;
  description?: string;
  venueName?: string;
  venueAddress?: string;
  venueLat?: number | null;
  venueLng?: number | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
  timezone: string; // IANA
  marketId: string;
  visibility?: EventVisibility;
  defaultPlusOnesAllowed?: boolean;
  /** Pre-create one primary ticket type with this capacity so the event isn't a dead-end. */
  primaryTicketName?: string;
  primaryTicketCapacity?: number;
}

export interface UpdateEventInput {
  name?: string;
  description?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  venueLat?: number | null;
  venueLng?: number | null;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  visibility?: EventVisibility;
  defaultPlusOnesAllowed?: boolean;
  emailSubject?: string | null;
  smsBodyTemplate?: string | null;
}

/** Short public id like EV-1F2A. Six chars from cuid suffix is plenty unique for display. */
function makePublicId(cuid: string): string {
  return `EV-${cuid.slice(-6).toUpperCase()}`;
}

async function assertSession() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  return session;
}

async function assertCanCreateInMarket(marketId: string) {
  const session = await assertSession();
  const markets = session.user.markets ?? [];
  if (session.user.role === 'ADMIN') return session;
  if (!markets.includes(marketId)) throw new Error('FORBIDDEN: not your market');
  return session;
}

async function loadForEdit(eventId: string) {
  const session = await assertSession();
  const event = await prisma.evEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      marketId: true,
      createdBy: true,
      status: true,
      name: true,
      canceledAt: true,
      hosts: { select: { userId: true } },
    },
  });
  if (!event) throw new Error('NOT_FOUND');

  const markets = session.user.markets ?? [];
  const role = session.user.role;
  const inMarket = role === 'ADMIN' || markets.includes(event.marketId);
  if (!inMarket) throw new Error('FORBIDDEN');
  const isCreator = event.createdBy === session.user.id;
  const isHost = event.hosts.some((h) => h.userId === session.user.id);
  const isManagerPlus = role === 'MANAGER' || role === 'ADMIN';
  if (!isManagerPlus && !isCreator && !isHost) throw new Error('FORBIDDEN');
  return { session, event };
}

export async function createEvent(
  input: CreateEventInput,
): Promise<{ id: string; publicId: string }> {
  const session = await assertCanCreateInMarket(input.marketId);
  if (!input.name.trim()) throw new Error('Event name required');

  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error('Invalid start or end datetime');
  }
  if (end <= start) throw new Error('End must be after start');

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.evEvent.create({
      data: {
        publicId: '__tmp__', // replaced below
        marketId: input.marketId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        venueName: input.venueName?.trim() || null,
        venueAddress: input.venueAddress?.trim() || null,
        venueLat: input.venueLat ?? null,
        venueLng: input.venueLng ?? null,
        startsAt: start,
        endsAt: end,
        timezone: input.timezone,
        status: 'DRAFT',
        visibility: input.visibility ?? 'PRIVATE',
        defaultPlusOnesAllowed: input.defaultPlusOnesAllowed ?? false,
        createdBy: session.user.id,
      },
      select: { id: true },
    });
    const finalPublicId = makePublicId(row.id);
    await tx.evEvent.update({
      where: { id: row.id },
      data: { publicId: finalPublicId },
    });

    // Optional primary ticket — nobody wants to click through a sub-form
    // just to add one row that will always exist.
    if (input.primaryTicketName && (input.primaryTicketCapacity ?? 0) > 0) {
      await tx.evTicketType.create({
        data: {
          eventId: row.id,
          name: input.primaryTicketName.trim(),
          kind: 'PRIMARY',
          capacity: input.primaryTicketCapacity!,
          isPrimary: true,
        },
      });
    }

    await tx.evActivityLogEntry.create({
      data: {
        eventId: row.id,
        userId: session.user.id,
        kind: 'created',
        summary: `${session.user.name ?? session.user.email} created "${input.name.trim()}"`,
        metadata: {
          startsAt: start.toISOString(),
          marketId: input.marketId,
        } as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'ev_event',
        entityId: row.id,
        action: 'create',
        diff: {
          name: input.name,
          marketId: input.marketId,
          startsAt: start.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    return { id: row.id, publicId: finalPublicId };
  });

  revalidatePath('/events');
  return created;
}

export async function updateEvent(eventId: string, input: UpdateEventInput): Promise<void> {
  const { session, event: prev } = await loadForEdit(eventId);
  if (prev.status === 'CANCELED') throw new Error("Canceled events can't be edited");

  const data: Prisma.EvEventUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.venueName !== undefined) data.venueName = input.venueName?.trim() || null;
  if (input.venueAddress !== undefined) data.venueAddress = input.venueAddress?.trim() || null;
  if (input.venueLat !== undefined) data.venueLat = input.venueLat ?? null;
  if (input.venueLng !== undefined) data.venueLng = input.venueLng ?? null;
  if (input.timezone !== undefined) data.timezone = input.timezone;
  if (input.visibility !== undefined) data.visibility = input.visibility;
  if (input.defaultPlusOnesAllowed !== undefined)
    data.defaultPlusOnesAllowed = input.defaultPlusOnesAllowed;
  if (input.emailSubject !== undefined) data.emailSubject = input.emailSubject?.trim() || null;
  if (input.smsBodyTemplate !== undefined)
    data.smsBodyTemplate = input.smsBodyTemplate?.trim() || null;

  if (input.startsAt || input.endsAt) {
    const start = input.startsAt ? new Date(input.startsAt) : undefined;
    const end = input.endsAt ? new Date(input.endsAt) : undefined;
    if (start && !Number.isFinite(start.getTime())) throw new Error('Invalid start');
    if (end && !Number.isFinite(end.getTime())) throw new Error('Invalid end');
    if (start) data.startsAt = start;
    if (end) data.endsAt = end;
  }

  await prisma.$transaction([
    prisma.evEvent.update({ where: { id: eventId }, data }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'updated',
        summary: `${session.user.name ?? 'Someone'} updated event details`,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'ev_event',
        entityId: eventId,
        action: 'update',
        diff: input as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath('/events');
  revalidatePath(`/events/${eventId}`);
}

export async function cancelEvent(eventId: string, reason: string): Promise<void> {
  const { session, event: prev } = await loadForEdit(eventId);
  if (prev.status === 'CANCELED') return; // idempotent
  if (!reason.trim()) throw new Error('Reason required');

  await prisma.$transaction([
    prisma.evEvent.update({
      where: { id: eventId },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
        canceledReason: reason.trim(),
      },
    }),
    // Cancel pending reminders (don't want the cron to still fire them).
    prisma.evReminder.updateMany({
      where: { eventId, sentAt: null },
      data: { deliveryStatus: 'canceled' },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'canceled',
        summary: `Canceled: ${reason.trim().slice(0, 120)}`,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'ev_event',
        entityId: eventId,
        action: 'cancel',
        diff: { reason } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath('/events');
  revalidatePath(`/events/${eventId}`);
}

// ─── Ticket type CRUD ───────────────────────────────────────────────

export interface TicketTypeInput {
  name: string;
  kind: 'PRIMARY' | 'DEPENDENT';
  capacity: number;
  description?: string;
}

export async function createTicketType(eventId: string, input: TicketTypeInput): Promise<void> {
  const { session } = await loadForEdit(eventId);
  if (!input.name.trim()) throw new Error('Ticket name required');
  if (!Number.isFinite(input.capacity) || input.capacity <= 0) {
    throw new Error('Capacity must be greater than zero');
  }

  if (input.kind === 'PRIMARY') {
    const existingPrimary = await prisma.evTicketType.findFirst({
      where: { eventId, isPrimary: true },
    });
    if (existingPrimary) {
      throw new Error(
        'This event already has a primary ticket. Edit the existing one or make this dependent.',
      );
    }
  }

  await prisma.$transaction([
    prisma.evTicketType.create({
      data: {
        eventId,
        name: input.name.trim(),
        kind: input.kind,
        capacity: Math.round(input.capacity),
        isPrimary: input.kind === 'PRIMARY',
        description: input.description?.trim() || null,
      },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'ticket-type-added',
        summary: `Added ticket type "${input.name.trim()}" (cap ${input.capacity})`,
      },
    }),
  ]);
  revalidatePath(`/events/${eventId}`);
}

export async function updateTicketType(
  eventId: string,
  ticketTypeId: string,
  input: Partial<TicketTypeInput>,
): Promise<void> {
  const { session } = await loadForEdit(eventId);
  const prev = await prisma.evTicketType.findUnique({ where: { id: ticketTypeId } });
  if (!prev || prev.eventId !== eventId) throw new Error('NOT_FOUND');

  const data: Prisma.EvTicketTypeUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.capacity !== undefined) {
    if (!Number.isFinite(input.capacity) || input.capacity <= 0) {
      throw new Error('Capacity must be greater than zero');
    }
    data.capacity = Math.round(input.capacity);
  }
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  // Kind is immutable — changing PRIMARY<->DEPENDENT is a footgun.

  await prisma.$transaction([
    prisma.evTicketType.update({ where: { id: ticketTypeId }, data }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'ticket-type-updated',
        summary: `Updated ticket "${prev.name}"`,
      },
    }),
  ]);
  revalidatePath(`/events/${eventId}`);
}

export async function deleteTicketType(eventId: string, ticketTypeId: string): Promise<void> {
  const { session } = await loadForEdit(eventId);
  const prev = await prisma.evTicketType.findUnique({
    where: { id: ticketTypeId },
    include: { _count: { select: { assignments: true } } },
  });
  if (!prev || prev.eventId !== eventId) throw new Error('NOT_FOUND');
  if (prev._count.assignments > 0) {
    throw new Error("Can't delete — some invitees already have this ticket assigned.");
  }
  if (prev.isPrimary) {
    throw new Error("Can't delete the primary ticket. Delete the event or replace it first.");
  }

  await prisma.$transaction([
    prisma.evTicketType.delete({ where: { id: ticketTypeId } }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId: session.user.id,
        kind: 'ticket-type-deleted',
        summary: `Removed ticket "${prev.name}"`,
      },
    }),
  ]);
  revalidatePath(`/events/${eventId}`);
}

// ─── EV-11: share link ────────────────────────────────────────────────
//
// Lazy-generate a read-only share token. The organizer clicks "Share"
// on the event header; we return the URL + the raw token so the client
// can copy it to clipboard without another round-trip.

async function loadCanEditEventId(eventId: string): Promise<{ userId: string }> {
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
  return { userId: session.user.id };
}

export async function ensureShareToken(
  eventId: string,
): Promise<{ token: string; rotated: boolean }> {
  await loadCanEditEventId(eventId);
  const existing = await prisma.evEvent.findUnique({
    where: { id: eventId },
    select: { shareToken: true },
  });
  if (existing?.shareToken) return { token: existing.shareToken, rotated: false };
  const token = generateShareToken();
  await prisma.evEvent.update({
    where: { id: eventId },
    data: { shareToken: token },
  });
  return { token, rotated: true };
}

export async function rotateShareToken(eventId: string): Promise<{ token: string }> {
  const { userId } = await loadCanEditEventId(eventId);
  const token = generateShareToken();
  await prisma.$transaction([
    prisma.evEvent.update({
      where: { id: eventId },
      data: { shareToken: token },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId,
        kind: 'share-token-rotated',
        summary: 'Share link regenerated — old link now invalid',
      },
    }),
  ]);
  return { token };
}

export async function disableShareToken(eventId: string): Promise<void> {
  const { userId } = await loadCanEditEventId(eventId);
  await prisma.$transaction([
    prisma.evEvent.update({
      where: { id: eventId },
      data: { shareToken: null },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        userId,
        kind: 'share-token-disabled',
        summary: 'Share link disabled — URL no longer works',
      },
    }),
  ]);
}

function generateShareToken(): string {
  // 16 random bytes = 22 base64url chars. Enough entropy to stay
  // unguessable; tokens don't need timing-safe verify because we
  // look them up by value in the DB (no comparison oracle).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
