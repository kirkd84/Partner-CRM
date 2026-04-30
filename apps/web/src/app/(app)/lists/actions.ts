'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import type { RouteStartMode } from '@partnerradar/types';
import { auth } from '@/auth';

/**
 * Hit List server actions — SPEC §6.4.
 *
 * A Hit List is one user's planned tour of partners for a given date. Hit
 * lists are private to the user (REPs can only see their own; managers+ can
 * see anyone's in their markets — the page filters accordingly).
 *
 * Phase 4 scope: CRUD + reorder + add/remove partners. Route optimization,
 * driving deep-links, and map integration come in a follow-up commit.
 */

const DEFAULT_DURATION_MIN = 20;

export async function createHitList(input: {
  date: string; // YYYY-MM-DD in user's market timezone
  marketId: string;
  startAddress: string;
  startLat?: number;
  startLng?: number;
  startMode: RouteStartMode;
}) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (!session.user.markets.includes(input.marketId)) throw new Error('FORBIDDEN: market');
  if (!input.date) throw new Error('Date required');

  // Parse YYYY-MM-DD as local midnight. Storing UTC midnight is fine for
  // the @@unique([userId, date]) check — everyone on the team agrees on
  // "the calendar day".
  const parts = input.date.split('-').map((n) => parseInt(n, 10));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) throw new Error('Invalid date');
  const dateUtc = new Date(Date.UTC(y, m - 1, d));

  // Phase 4 later will resolve lat/lng from startAddress via Google Maps.
  // For now we accept optional coords; default to 0,0 (unused until the
  // map layer ships).
  const list = await prisma.hitList.create({
    data: {
      userId: session.user.id,
      marketId: input.marketId,
      date: dateUtc,
      startAddress: input.startAddress.trim() || 'Office',
      startLat: input.startLat ?? 0,
      startLng: input.startLng ?? 0,
      startMode: input.startMode,
    },
  });

  revalidatePath('/lists');
  redirect(`/lists/${list.id}`);
}

async function assertCanEditList(listId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const list = await prisma.hitList.findUnique({
    where: { id: listId },
    select: { id: true, userId: true, marketId: true },
  });
  if (!list) throw new Error('NOT_FOUND');

  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  const isOwner = list.userId === session.user.id;
  const inMarket = session.user.markets.includes(list.marketId);

  if (!inMarket) throw new Error('FORBIDDEN');
  if (!isManagerPlus && !isOwner) throw new Error('FORBIDDEN');

  return { session, list };
}

export async function addPartnerToList(listId: string, partnerId: string) {
  const { list } = await assertCanEditList(listId);

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, marketId: true, archivedAt: true },
  });
  if (!partner || partner.archivedAt) throw new Error('Partner unavailable');
  if (partner.marketId !== list.marketId) throw new Error('Partner not in this market');

  // Already on the list? No-op.
  const existing = await prisma.hitListStop.findFirst({
    where: { hitListId: listId, partnerId },
    select: { id: true },
  });
  if (existing) {
    revalidatePath(`/lists/${listId}`);
    return { ok: true, alreadyAdded: true };
  }

  const maxOrder = await prisma.hitListStop.aggregate({
    where: { hitListId: listId },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  // Planned arrival = list date + (nextOrder * 30 minutes) — a placeholder
  // until real routing arrives. Managers can adjust on the detail page.
  const listRow = await prisma.hitList.findUniqueOrThrow({
    where: { id: listId },
    select: { date: true },
  });
  const plannedArrival = new Date(listRow.date.getTime() + nextOrder * 30 * 60_000);

  await prisma.hitListStop.create({
    data: {
      hitListId: listId,
      partnerId,
      order: nextOrder,
      plannedArrival,
      plannedDurationMin: DEFAULT_DURATION_MIN,
    },
  });

  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

export async function removeStop(stopId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const stop = await prisma.hitListStop.findUnique({
    where: { id: stopId },
    select: { hitListId: true },
  });
  if (!stop) throw new Error('NOT_FOUND');
  await assertCanEditList(stop.hitListId);

  await prisma.hitListStop.delete({ where: { id: stopId } });

  // Re-pack order so the UI doesn't show gaps.
  const remaining = await prisma.hitListStop.findMany({
    where: { hitListId: stop.hitListId },
    orderBy: { order: 'asc' },
    select: { id: true },
  });
  await Promise.all(
    remaining.map((s, idx) =>
      prisma.hitListStop.update({ where: { id: s.id }, data: { order: idx } }),
    ),
  );

  revalidatePath(`/lists/${stop.hitListId}`);
  return { ok: true };
}

export async function reorderStops(listId: string, stopIdsInOrder: string[]) {
  await assertCanEditList(listId);

  // Validate every stopId belongs to this list before mutating anything.
  const stops = await prisma.hitListStop.findMany({
    where: { hitListId: listId },
    select: { id: true },
  });
  const validIds = new Set(stops.map((s) => s.id));
  for (const id of stopIdsInOrder) {
    if (!validIds.has(id)) throw new Error('Invalid stop id');
  }
  if (stopIdsInOrder.length !== stops.length) throw new Error('Must reorder all stops');

  await prisma.$transaction(
    stopIdsInOrder.map((id, idx) =>
      prisma.hitListStop.update({ where: { id }, data: { order: idx } }),
    ),
  );

  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

export async function markStopComplete(stopId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const stop = await prisma.hitListStop.findUnique({
    where: { id: stopId },
    select: { hitListId: true, partnerId: true, completedAt: true },
  });
  if (!stop) throw new Error('NOT_FOUND');
  await assertCanEditList(stop.hitListId);

  const now = stop.completedAt ? null : new Date();
  await prisma.hitListStop.update({
    where: { id: stopId },
    data: { completedAt: now, skippedAt: null },
  });

  // Log an Activity on the partner when a check-in completes (skip undo).
  if (now) {
    await prisma.activity.create({
      data: {
        partnerId: stop.partnerId,
        userId: session.user.id,
        type: 'VISIT',
        body: `${session.user.name} checked in as a hit-list stop.`,
      },
    });
  }

  revalidatePath(`/lists/${stop.hitListId}`);
  return { ok: true };
}

export async function deleteHitList(listId: string) {
  const { list } = await assertCanEditList(listId);
  // Cascade via schema removes stops automatically.
  await prisma.hitList.delete({ where: { id: list.id } });
  revalidatePath('/lists');
  redirect('/lists');
}

/**
 * Phase 9: skip a stop with an optional reason. Mirrors markStopComplete
 * but the activity body never logs a check-in — it logs the no-go.
 */
export async function skipStop(stopId: string, reason?: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const stop = await prisma.hitListStop.findUnique({
    where: { id: stopId },
    select: { hitListId: true, partnerId: true, skippedAt: true },
  });
  if (!stop) throw new Error('NOT_FOUND');
  await assertCanEditList(stop.hitListId);

  const now = stop.skippedAt ? null : new Date();
  await prisma.hitListStop.update({
    where: { id: stopId },
    data: {
      skippedAt: now,
      skipReason: now ? reason?.trim() || null : null,
      completedAt: null,
    },
  });

  if (now) {
    await prisma.activity.create({
      data: {
        partnerId: stop.partnerId,
        userId: session.user.id,
        type: 'VISIT',
        body: `${session.user.name} skipped a planned stop${reason ? `: ${reason.trim()}` : ''}.`,
      },
    });
  }
  revalidatePath(`/lists/${stop.hitListId}`);
  return { ok: true };
}

/**
 * Phase 9: run the route optimizer over a hit list. Uses Google
 * Directions when GOOGLE_MAPS_API_KEY is set, otherwise a greedy
 * nearest-neighbor heuristic over haversine distance. Persists the
 * new order + planned arrivals back to HitListStop.
 *
 * "Re-plan from here" use case: pass startedAt = now() and an
 * override startLat/startLng (typically the rep's current GPS).
 */
export async function optimizeHitList(
  listId: string,
  opts: { startedAt?: string; startLat?: number; startLng?: number } = {},
) {
  const { list } = await assertCanEditList(listId);
  const stops = await prisma.hitListStop.findMany({
    where: { hitListId: list.id, completedAt: null, skippedAt: null },
    include: { partner: { select: { lat: true, lng: true } } },
    orderBy: { order: 'asc' },
  });
  if (stops.length === 0) return { ok: false, reason: 'No remaining stops to optimize' as const };

  const usable = stops.filter((s) => s.partner.lat != null && s.partner.lng != null);
  const skipped = stops.length - usable.length;

  const { optimizeRoute } = await import('@/lib/lists/optimize-route');
  const startedAt = opts.startedAt ?? defaultStartedAt(list.date);
  const result = await optimizeRoute({
    startLat: opts.startLat ?? list.startLat,
    startLng: opts.startLng ?? list.startLng,
    startedAt,
    stops: usable.map((s) => ({
      id: s.id,
      lat: s.partner.lat!,
      lng: s.partner.lng!,
      isAppointmentLock: s.isAppointmentLock,
      ...(s.isAppointmentLock ? { fixedArrival: s.plannedArrival.toISOString() } : {}),
      visitDurationMin: s.plannedDurationMin,
    })),
  });

  await prisma.$transaction([
    ...result.stops.map((s) =>
      prisma.hitListStop.update({
        where: { id: s.id },
        data: {
          order: s.order,
          plannedArrival: new Date(s.plannedArrival),
          plannedDurationMin: s.plannedDurationMin,
          // v2: persist leg + ETA so the run view + map render the
          // same numbers the optimizer just produced.
          distanceFromPrevMi: s.legDistanceMi,
          durationFromPrevMin: Math.round(s.legDurationMin),
          arrivalEta: new Date(s.plannedArrival),
        },
      }),
    ),
    prisma.hitList.update({
      where: { id: list.id },
      data: {
        totalDistance: result.totalDistanceMi,
        totalDuration: result.totalDurationMin,
      },
    }),
  ]);
  revalidatePath(`/lists/${list.id}`);
  revalidatePath(`/lists/${list.id}/run`);
  return {
    ok: true as const,
    provider: result.provider,
    totalDistance: result.totalDistanceMi,
    totalDuration: result.totalDurationMin,
    skippedNoGeo: skipped,
  };
}

/**
 * Phase 4.4 (lasso): create a Hit List in one shot from a list of
 * partner IDs — used by the Map's lasso flow so the rep can drop
 * 25 partners into a list with one tap. Idempotent on (userId, date)
 * so re-lassoing on the same day adds to the existing list rather
 * than failing.
 */
export async function createHitListWithStops(input: {
  marketId: string;
  date: string; // YYYY-MM-DD
  startAddress?: string;
  startLat?: number;
  startLng?: number;
  startMode?: RouteStartMode;
  partnerIds: string[];
}): Promise<{ id: string; added: number; skipped: number }> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (!session.user.markets.includes(input.marketId)) throw new Error('FORBIDDEN: market');
  if (!input.date) throw new Error('Date required');
  if (input.partnerIds.length === 0) throw new Error('Select at least one partner');

  const parts = input.date.split('-').map((n) => parseInt(n, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d) throw new Error('Invalid date');
  const dateUtc = new Date(Date.UTC(y, m - 1, d));

  // Find or create the day's list. Reuse so the unique (userId, date)
  // index doesn't bite, and so a rep can lasso multiple territories
  // and they aggregate.
  let list = await prisma.hitList.findUnique({
    where: { userId_date: { userId: session.user.id, date: dateUtc } },
  });
  if (!list) {
    list = await prisma.hitList.create({
      data: {
        userId: session.user.id,
        marketId: input.marketId,
        date: dateUtc,
        startAddress: input.startAddress?.trim() || 'Office',
        startLat: input.startLat ?? 0,
        startLng: input.startLng ?? 0,
        startMode: input.startMode ?? 'OFFICE',
      },
    });
  } else if (list.marketId !== input.marketId) {
    throw new Error('A list for that date already exists in another market.');
  }

  // Validate partners belong to this market and are not archived.
  const partners = await prisma.partner.findMany({
    where: {
      id: { in: input.partnerIds },
      marketId: input.marketId,
      archivedAt: null,
    },
    select: { id: true },
  });
  const validIds = new Set(partners.map((p) => p.id));

  const existingStops = await prisma.hitListStop.findMany({
    where: { hitListId: list.id, partnerId: { in: [...validIds] } },
    select: { partnerId: true },
  });
  const alreadyOnList = new Set(existingStops.map((s) => s.partnerId));

  const maxOrder = await prisma.hitListStop.aggregate({
    where: { hitListId: list.id },
    _max: { order: true },
  });
  let nextOrder = (maxOrder._max.order ?? -1) + 1;
  const baseTime = list.date.getTime();

  let added = 0;
  for (const id of input.partnerIds) {
    if (!validIds.has(id) || alreadyOnList.has(id)) continue;
    await prisma.hitListStop.create({
      data: {
        hitListId: list.id,
        partnerId: id,
        order: nextOrder,
        plannedArrival: new Date(baseTime + nextOrder * 30 * 60_000),
        plannedDurationMin: DEFAULT_DURATION_MIN,
      },
    });
    nextOrder++;
    added++;
  }

  revalidatePath('/lists');
  revalidatePath(`/lists/${list.id}`);
  return {
    id: list.id,
    added,
    skipped: input.partnerIds.length - added,
  };
}

function defaultStartedAt(listDate: Date): string {
  // Use 8am Mountain on the list date as the rep's nominal start.
  const d = new Date(listDate);
  d.setUTCHours(13, 0, 0, 0);
  return d.toISOString();
}
