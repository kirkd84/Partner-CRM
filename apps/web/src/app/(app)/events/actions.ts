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
export type EventVisibility = 'PRIVATE' | 'MARKET_WIDE' | 'PUBLIC' | 'HOST_ONLY';

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

  const created = await prisma
    .$transaction(async (tx) => {
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
    })
    // Surface a clean message back to the client instead of a naked
    // "500 Internal Server Error" — the UI drawer shows this text.
    .catch((err) => {
      console.error('[createEvent] failed', err);
      if (err instanceof Error) {
        throw new Error(`Couldn't create event: ${err.message}`);
      }
      throw new Error("Couldn't create event (server error).");
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

// ─── Recurring event series ────────────────────────────────────────
//
// A series is N occurrences of the same event linked by seriesId on
// every row (the canonical "parent" being the first one created).
// We generate the occurrence dates server-side from a small recurrence
// shape — no need for a full RRULE parser, weekly / biweekly / monthly-
// by-weekday covers every recurring use case Roof Tech has named.

export type RecurrencePattern = 'weekly' | 'biweekly' | 'monthly_by_weekday';

export interface RecurrenceInput {
  pattern: RecurrencePattern;
  /** Number of occurrences to generate, including the first one. Capped at 52. */
  count: number;
}

/**
 * Generate ISO start times for N occurrences. Always preserves the
 * time-of-day from the seed start (e.g., 4pm Friday stays 4pm Friday
 * each week).
 *
 * For monthly_by_weekday we figure out the seed's "Nth weekday" of
 * its month, then advance month-by-month, snapping to the same Nth
 * weekday. Edge case: if the source month has 5 Fridays but a target
 * month has only 4, we use the last weekday of that month so the
 * series doesn't disappear silently.
 */
function generateOccurrenceDates(
  seedStart: Date,
  pattern: RecurrencePattern,
  count: number,
): Date[] {
  const safe = Math.max(1, Math.min(52, count));
  const dates: Date[] = [new Date(seedStart.getTime())];
  if (pattern === 'weekly' || pattern === 'biweekly') {
    const stepDays = pattern === 'weekly' ? 7 : 14;
    for (let i = 1; i < safe; i++) {
      const next = new Date(seedStart.getTime());
      next.setUTCDate(next.getUTCDate() + stepDays * i);
      dates.push(next);
    }
    return dates;
  }
  // monthly_by_weekday — preserve "the Nth <weekday>" of the month.
  const weekday = seedStart.getDay();
  const dayOfMonth = seedStart.getDate();
  const nthWeekday = Math.ceil(dayOfMonth / 7); // 1..5
  for (let i = 1; i < safe; i++) {
    const target = new Date(seedStart);
    target.setMonth(seedStart.getMonth() + i);
    // Find the Nth weekday of that month.
    target.setDate(1);
    const firstWeekday = target.getDay();
    const offset = (weekday - firstWeekday + 7) % 7;
    let day = 1 + offset + (nthWeekday - 1) * 7;
    // Clamp if month doesn't have an Nth weekday — fall back to the
    // last weekday-of-the-week in that month.
    const tmp = new Date(target.getFullYear(), target.getMonth() + 1, 0);
    if (day > tmp.getDate()) day -= 7;
    target.setDate(day);
    target.setHours(seedStart.getHours(), seedStart.getMinutes(), seedStart.getSeconds(), 0);
    dates.push(target);
  }
  return dates;
}

/**
 * Create a recurring event series. All occurrences share the seriesId
 * of the first one — that's how /events list groups them, and how the
 * detail page can offer "edit this vs edit series" later.
 *
 * Returns the list of created occurrence ids in chronological order.
 */
export async function createRecurringEventSeries(
  input: CreateEventInput & { recurrence: RecurrenceInput },
): Promise<{ seriesId: string; occurrenceIds: string[] }> {
  if (!input.recurrence) throw new Error('recurrence input required');
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error('Invalid start or end datetime');
  }
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) throw new Error('End must be after start');

  const dates = generateOccurrenceDates(start, input.recurrence.pattern, input.recurrence.count);
  const ids: string[] = [];
  let seriesId: string | null = null;

  // Sequential — keeps PR-like publicIds monotonic and avoids slamming
  // the DB with parallel transactions for what's typically a small N.
  for (let i = 0; i < dates.length; i++) {
    const occStart = dates[i]!;
    const occEnd = new Date(occStart.getTime() + durationMs);
    const occInput: CreateEventInput = {
      ...input,
      startsAt: occStart.toISOString(),
      endsAt: occEnd.toISOString(),
      // Tag every occurrence with a marker in the description so a
      // future cleanup can find them; users typically also see this.
      name: i === 0 || !input.name ? input.name : input.name, // keep same name across the series; the date disambiguates
    };
    const created = await createEvent(occInput);
    ids.push(created.id);
    if (i === 0) {
      seriesId = created.id;
      // Flag the parent with the human-readable recurrence rule.
      await prisma.evEvent.update({
        where: { id: created.id },
        data: {
          seriesId,
          recurrenceRule: `FREQ=${input.recurrence.pattern.toUpperCase()};COUNT=${input.recurrence.count}`,
        },
      });
    } else {
      await prisma.evEvent.update({
        where: { id: created.id },
        data: { seriesId: seriesId! },
      });
    }
  }

  return { seriesId: seriesId!, occurrenceIds: ids };
}

/**
 * Cancel future occurrences of a series — leaves past ones intact so
 * the audit log + attendance history survive. The cancellation
 * cascade per occurrence (refund tickets, email attendees, etc.) is
 * handled by the existing cancelEvent path; we just loop it.
 */
export async function cancelEventSeriesGoingForward(
  eventId: string,
  reason: string,
): Promise<{ canceled: number }> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');

  const seed = await prisma.evEvent.findUnique({
    where: { id: eventId },
    select: { id: true, seriesId: true, startsAt: true, marketId: true },
  });
  if (!seed) throw new Error('NOT_FOUND');
  const seriesId = seed.seriesId ?? seed.id;
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  const isInMarket = (session.user.markets ?? []).includes(seed.marketId);
  if (!isManagerPlus && !isInMarket) throw new Error('FORBIDDEN');

  const future = await prisma.evEvent.findMany({
    where: {
      OR: [{ id: seriesId }, { seriesId }],
      startsAt: { gte: seed.startsAt },
      canceledAt: null,
    },
    select: { id: true },
  });

  for (const e of future) {
    try {
      await cancelEvent(e.id, reason);
    } catch (err) {
      console.warn('[cancelSeries] one occurrence failed', { eventId: e.id, err });
    }
  }
  return { canceled: future.length };
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
