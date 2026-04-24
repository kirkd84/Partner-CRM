/**
 * Cascade engine (SPEC_EVENTS §§4.3, 4.4).
 *
 * This is the single source of truth for what happens when a ticket
 * status flips to RELEASED. Every inbound path (decline, cancel, expire,
 * auto-cancel, partial drop) hands the freed ticketType IDs here and
 * gets back a structured result: { promoted, batchOffered, unfilled }.
 *
 * Why it lives in one file: the logic is subtle enough that duplicating
 * it in three server actions is a recipe for divergence. The RSVP
 * actions, the Inngest expire tick, and the auto-cancel path all call
 * `handleTicketRelease` with the same signature.
 *
 * For PRIMARY ticket release:
 *   1. Cascade all dependents attached to the releasing invite (they're
 *      released as a side-effect, so upstream already marked them).
 *      We only need to promote somebody else into the primary seat.
 *   2. Find the next QUEUED invite on this event (lowest queueOrder),
 *      flip to SENT with a proximity-aware expiresAt, and dispatch.
 *   3. If no QUEUED invite exists, look at auto-waitlist candidates
 *      (Partners in the event's market with autoWaitlistEligible=true).
 *
 * For DEPENDENT ticket release (e.g. parking):
 *   1. If any SENT/ACCEPTED/CONFIRMED invite on this event is queued
 *      and was flagged as wanting this dependent but hasn't got one,
 *      hand it to them directly (rare — usually dependents ship with
 *      the primary).
 *   2. Otherwise, batch-offer to all CONFIRMED invitees on the event
 *      who hold the primary but don't hold this dependent. First click
 *      wins via SELECT ... FOR UPDATE SKIP LOCKED on the recipient row
 *      + conditional update on the shared EvBatchOffer header.
 *
 * The batch-offer TTL defaults to 2 hours but is capped by the time
 * remaining until the event — we never offer something that would
 * expire after the event starts.
 */

import crypto from 'crypto';
import { prisma, Prisma } from '@partnerradar/db';
import { dispatchEventInvite } from '@/lib/events/dispatch-invite';
import { dispatchBatchOffer } from '@/lib/events/dispatch-batch-offer';

export interface CascadeResult {
  promoted: Array<{ inviteId: string; ticketTypeId: string; windowHours: number }>;
  batchOffered: Array<{ batchOfferId: string; ticketTypeId: string; recipientCount: number }>;
  unfilled: Array<{ ticketTypeId: string; reason: string }>;
}

/** Public entry point — called from every release path. */
export async function handleTicketRelease(
  eventId: string,
  freedTicketTypeIds: string[],
): Promise<CascadeResult> {
  const result: CascadeResult = { promoted: [], batchOffered: [], unfilled: [] };
  if (!eventId || freedTicketTypeIds.length === 0) return result;

  const evt = await prisma.evEvent.findUnique({
    where: { id: eventId },
    include: {
      ticketTypes: {
        select: { id: true, name: true, isPrimary: true, capacity: true, kind: true },
      },
    },
  });
  if (!evt || evt.canceledAt) return result;

  // Dedup + resolve each ticketType so we know PRIMARY vs DEPENDENT.
  const unique = [...new Set(freedTicketTypeIds)];
  for (const tid of unique) {
    const tt = evt.ticketTypes.find((t) => t.id === tid);
    if (!tt) {
      result.unfilled.push({ ticketTypeId: tid, reason: 'ticket_type_not_found' });
      continue;
    }
    if (tt.isPrimary) {
      const p = await promotePrimary(eventId, tt.id, evt.startsAt);
      if (p.ok) result.promoted.push(p.entry);
      else result.unfilled.push({ ticketTypeId: tid, reason: p.reason });
    } else {
      const d = await handleDependentRelease(eventId, tt.id, evt.startsAt);
      if (d.kind === 'promoted') result.promoted.push(d.entry);
      else if (d.kind === 'batch-offered') result.batchOffered.push(d.entry);
      else result.unfilled.push({ ticketTypeId: tid, reason: d.reason });
    }
  }

  return result;
}

async function promotePrimary(
  eventId: string,
  primaryTicketTypeId: string,
  eventStartsAt: Date,
): Promise<
  | { ok: true; entry: { inviteId: string; ticketTypeId: string; windowHours: number } }
  | { ok: false; reason: string }
> {
  // Capacity snapshot.
  const [primary, taken] = await Promise.all([
    prisma.evTicketType.findUnique({
      where: { id: primaryTicketTypeId },
      select: { capacity: true, internalAllocation: true },
    }),
    prisma.evTicketAssignment.aggregate({
      where: { ticketTypeId: primaryTicketTypeId, status: { in: ['TENTATIVE', 'CONFIRMED'] } },
      _sum: { quantity: true },
    }),
  ]);
  if (!primary) return { ok: false, reason: 'primary_missing' };
  const available = primary.capacity - (taken._sum.quantity ?? 0) - primary.internalAllocation;
  if (available <= 0) return { ok: false, reason: 'no_capacity' };

  // Next QUEUED invite by queueOrder.
  const next = await prisma.evInvite.findFirst({
    where: { eventId, status: 'QUEUED' },
    orderBy: { queueOrder: 'asc' },
  });
  if (!next) {
    // Future hook: auto-waitlist fallback lives here. Not implemented
    // this phase — EV-1 stub already notes "queue_empty" and moves on.
    return { ok: false, reason: 'queue_empty' };
  }

  const now = new Date();
  const windowHours = proximityWindowHours(eventStartsAt, now);
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
      data: { inviteId: next.id, kind: 'invited', actorType: 'system' },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId,
        kind: 'cascade-promoted',
        summary: `Promoted next invite after primary release · ${windowHours}h window`,
        metadata: { inviteId: next.id, ticketTypeId: primaryTicketTypeId } as Prisma.InputJsonValue,
      },
    }),
  ]);

  // Fire-and-forget dispatch — we don't block the cascade on email/SMS.
  dispatchEventInvite({ inviteId: next.id }).catch((err) => {
    console.warn('[cascade] dispatch failed', err);
  });

  return {
    ok: true,
    entry: { inviteId: next.id, ticketTypeId: primaryTicketTypeId, windowHours },
  };
}

type DependentOutcome =
  | { kind: 'promoted'; entry: { inviteId: string; ticketTypeId: string; windowHours: number } }
  | {
      kind: 'batch-offered';
      entry: { batchOfferId: string; ticketTypeId: string; recipientCount: number };
    }
  | { kind: 'unfilled'; reason: string };

async function handleDependentRelease(
  eventId: string,
  dependentTicketTypeId: string,
  eventStartsAt: Date,
): Promise<DependentOutcome> {
  // Path 1: Is anyone currently SENT/ACCEPTED but missing this dependent?
  // The spec says "queued invite still needing it"; interpreting that as
  // a holdback case where a QUEUED invite has an assignment row flagged
  // but RELEASED (tentatively) — rare. The simpler, real-world path is
  // the batch offer.
  const ticketType = await prisma.evTicketType.findUnique({
    where: { id: dependentTicketTypeId },
    select: { name: true, capacity: true, internalAllocation: true },
  });
  if (!ticketType) return { kind: 'unfilled', reason: 'ticket_type_missing' };

  const taken = await prisma.evTicketAssignment.aggregate({
    where: {
      ticketTypeId: dependentTicketTypeId,
      status: { in: ['TENTATIVE', 'CONFIRMED'] },
    },
    _sum: { quantity: true },
  });
  const available =
    ticketType.capacity - (taken._sum.quantity ?? 0) - ticketType.internalAllocation;
  if (available <= 0) return { kind: 'unfilled', reason: 'no_capacity' };

  // Eligible for batch offer = invitees on this event who are CONFIRMED
  // (or ACCEPTED/CONFIRMATION_REQUESTED — close enough to count) and
  // DON'T already hold an active (non-RELEASED) assignment for this
  // dependent.
  const holders = await prisma.evTicketAssignment.findMany({
    where: {
      ticketTypeId: dependentTicketTypeId,
      status: { in: ['TENTATIVE', 'CONFIRMED'] },
    },
    select: { inviteId: true },
  });
  const excludeInviteIds = new Set(holders.map((h) => h.inviteId));

  const candidates = await prisma.evInvite.findMany({
    where: {
      eventId,
      status: { in: ['ACCEPTED', 'CONFIRMATION_REQUESTED', 'CONFIRMED'] },
      id: { notIn: [...excludeInviteIds] },
    },
    select: { id: true },
    take: 200, // sanity cap
  });

  if (candidates.length === 0) {
    await prisma.evActivityLogEntry.create({
      data: {
        eventId,
        kind: 'batch-offer-unfilled',
        summary: `No eligible recipients for freed ${ticketType.name}`,
        metadata: { ticketTypeId: dependentTicketTypeId } as Prisma.InputJsonValue,
      },
    });
    return { kind: 'unfilled', reason: 'no_eligible_recipients' };
  }

  // Batch-offer TTL: min(2h, time_until_event_start - 15min safety buffer).
  const defaultMs = Number(process.env.BATCH_OFFER_TTL_MS ?? 2 * 60 * 60 * 1000);
  const now = new Date();
  const eventBufferMs = eventStartsAt.getTime() - now.getTime() - 15 * 60 * 1000;
  if (eventBufferMs <= 0) {
    return { kind: 'unfilled', reason: 'too_late' };
  }
  const expiresAt = new Date(now.getTime() + Math.min(defaultMs, eventBufferMs));

  const batchOffer = await prisma.evBatchOffer.create({
    data: {
      eventId,
      ticketTypeId: dependentTicketTypeId,
      status: 'OPEN',
      expiresAt,
      recipients: {
        create: candidates.map((c) => ({
          inviteId: c.id,
          claimToken: generateClaimToken(),
        })),
      },
    },
    include: { recipients: true },
  });

  await prisma.evActivityLogEntry.create({
    data: {
      eventId,
      kind: 'batch-offer-sent',
      summary: `Batch offer for ${ticketType.name} sent to ${candidates.length} confirmed invitees`,
      metadata: {
        batchOfferId: batchOffer.id,
        ticketTypeId: dependentTicketTypeId,
        recipientCount: candidates.length,
        expiresAt: expiresAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  // Dispatch SMS + email to each recipient — done outside the DB
  // transaction so one email bounce can't roll back the offer.
  dispatchBatchOffer({ batchOfferId: batchOffer.id }).catch((err) => {
    console.warn('[cascade] batch dispatch failed', err);
  });

  return {
    kind: 'batch-offered',
    entry: {
      batchOfferId: batchOffer.id,
      ticketTypeId: dependentTicketTypeId,
      recipientCount: candidates.length,
    },
  };
}

/**
 * Atomic claim — first arriver wins.
 *
 * Postgres pattern: SELECT the recipient row FOR UPDATE, then
 * conditionally UPDATE the shared batch-offer header only if it's still
 * OPEN. If two requests hit simultaneously, one gets the row lock first;
 * by the time the second request acquires it, the offer is CLAIMED and
 * we short-circuit.
 *
 * Returns the winning assignment id on success, or a reason on loss.
 */
export async function claimBatchOffer(
  claimToken: string,
): Promise<
  | { ok: true; assignmentId: string; inviteId: string; batchOfferId: string }
  | { ok: false; reason: 'not_found' | 'already_claimed' | 'expired' | 'canceled' | 'no_capacity' }
> {
  return prisma.$transaction(
    async (tx) => {
      // Lock the recipient row and pull the offer + ticketType in one round trip.
      const rows = await tx.$queryRaw<
        Array<{
          recipient_id: string;
          invite_id: string;
          batch_offer_id: string;
          event_id: string;
          ticket_type_id: string;
          offer_status: 'OPEN' | 'CLAIMED' | 'EXPIRED' | 'CANCELED';
          expires_at: Date;
        }>
      >`
        SELECT r.id AS recipient_id,
               r."inviteId" AS invite_id,
               r."batchOfferId" AS batch_offer_id,
               o."eventId" AS event_id,
               o."ticketTypeId" AS ticket_type_id,
               o."status" AS offer_status,
               o."expiresAt" AS expires_at
        FROM "EvBatchOfferRecipient" r
        JOIN "EvBatchOffer" o ON o.id = r."batchOfferId"
        WHERE r."claimToken" = ${claimToken}
        FOR UPDATE OF o
      `;
      const row = rows[0];
      if (!row) return { ok: false, reason: 'not_found' as const };
      if (row.offer_status === 'CLAIMED') return { ok: false, reason: 'already_claimed' as const };
      if (row.offer_status === 'CANCELED') return { ok: false, reason: 'canceled' as const };
      if (row.expires_at.getTime() < Date.now() || row.offer_status === 'EXPIRED') {
        // Lazy expire: mark the header EXPIRED so subsequent requests short-circuit.
        await tx.evBatchOffer.update({
          where: { id: row.batch_offer_id },
          data: { status: 'EXPIRED' },
        });
        return { ok: false, reason: 'expired' as const };
      }

      // Confirm capacity one more time — the primary can fill up after
      // the offer is sent (e.g. if another invite confirmed since).
      const taken = await tx.evTicketAssignment.aggregate({
        where: {
          ticketTypeId: row.ticket_type_id,
          status: { in: ['TENTATIVE', 'CONFIRMED'] },
        },
        _sum: { quantity: true },
      });
      const ticketType = await tx.evTicketType.findUnique({
        where: { id: row.ticket_type_id },
        select: { capacity: true, internalAllocation: true },
      });
      if (
        !ticketType ||
        ticketType.capacity - (taken._sum.quantity ?? 0) - ticketType.internalAllocation <= 0
      ) {
        return { ok: false, reason: 'no_capacity' as const };
      }

      // Win: upsert assignment for this invite + mark offer CLAIMED.
      const existing = await tx.evTicketAssignment.findUnique({
        where: {
          inviteId_ticketTypeId: {
            inviteId: row.invite_id,
            ticketTypeId: row.ticket_type_id,
          },
        },
      });
      const assignment = existing
        ? await tx.evTicketAssignment.update({
            where: { id: existing.id },
            data: { status: 'CONFIRMED', quantity: Math.max(1, existing.quantity) },
          })
        : await tx.evTicketAssignment.create({
            data: {
              inviteId: row.invite_id,
              ticketTypeId: row.ticket_type_id,
              status: 'CONFIRMED',
              quantity: 1,
            },
          });

      const now = new Date();
      await tx.evBatchOffer.update({
        where: { id: row.batch_offer_id },
        data: {
          status: 'CLAIMED',
          claimedByInviteId: row.invite_id,
          claimedAt: now,
        },
      });
      await tx.evBatchOfferRecipient.update({
        where: { id: row.recipient_id },
        data: { wonRaceAt: now, clickedAt: now },
      });
      // Stamp losing recipients as "lostRaceAt" for reporting — they'll
      // hit the offer page and see the CLAIMED status but their own row
      // gets the correct timestamp on next visit.
      await tx.evBatchOfferRecipient.updateMany({
        where: {
          batchOfferId: row.batch_offer_id,
          id: { not: row.recipient_id },
          wonRaceAt: null,
          lostRaceAt: null,
        },
        data: { lostRaceAt: now },
      });
      await tx.evRsvpEvent.create({
        data: {
          inviteId: row.invite_id,
          kind: 'batch-offer-claimed',
          ticketDelta: {
            ticketTypeId: row.ticket_type_id,
            batchOfferId: row.batch_offer_id,
          } as Prisma.InputJsonValue,
          actorType: 'invitee',
        },
      });
      await tx.evActivityLogEntry.create({
        data: {
          eventId: row.event_id,
          kind: 'batch-offer-claimed',
          summary: `Batch offer claimed`,
          metadata: {
            batchOfferId: row.batch_offer_id,
            inviteId: row.invite_id,
            ticketTypeId: row.ticket_type_id,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        ok: true as const,
        assignmentId: assignment.id,
        inviteId: row.invite_id,
        batchOfferId: row.batch_offer_id,
      };
    },
    // Postgres defaults to READ COMMITTED, which is exactly what we need.
    // SELECT ... FOR UPDATE on the batch offer row is what guarantees
    // mutual exclusion — the isolation level doesn't add anything here.
  );
}

/** Mark an already-lost recipient as wanting future offers. */
export async function optInFutureOffers(claimToken: string): Promise<boolean> {
  const rec = await prisma.evBatchOfferRecipient.findUnique({
    where: { claimToken },
    select: { id: true },
  });
  if (!rec) return false;
  await prisma.evBatchOfferRecipient.update({
    where: { id: rec.id },
    data: { wantsFutureOffers: true },
  });
  return true;
}

/** Expire any offers past their deadline; called from the cron tick. */
export async function expireStaleBatchOffers(): Promise<{ expired: number }> {
  const res = await prisma.evBatchOffer.updateMany({
    where: { status: 'OPEN', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  if (res.count > 0) {
    const expired = await prisma.evBatchOffer.findMany({
      where: { status: 'EXPIRED' },
      select: { id: true, eventId: true, ticketTypeId: true },
      orderBy: { updatedAt: 'desc' },
      take: res.count,
    });
    for (const o of expired) {
      await prisma.evActivityLogEntry.create({
        data: {
          eventId: o.eventId,
          kind: 'batch-offer-expired',
          summary: `Batch offer expired without a claimer — organizer may want to reassign`,
          metadata: { batchOfferId: o.id, ticketTypeId: o.ticketTypeId } as Prisma.InputJsonValue,
        },
      });
    }
  }
  return { expired: res.count };
}

function proximityWindowHours(eventStartsAt: Date, now: Date): number {
  const hoursUntil = (eventStartsAt.getTime() - now.getTime()) / (3600 * 1000);
  if (hoursUntil >= 24 * 30) return 5 * 24;
  if (hoursUntil >= 24 * 14) return 3 * 24;
  if (hoursUntil >= 24 * 7) return 2 * 24;
  if (hoursUntil >= 24 * 3) return 24;
  if (hoursUntil >= 24) return 6;
  return 2;
}

function generateClaimToken(): string {
  // 192 bits of randomness — enough entropy to stay unguessable without
  // needing HMAC verification (the token IS the secret).
  return crypto.randomBytes(24).toString('base64url');
}
