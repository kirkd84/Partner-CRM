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
    remaining.map((s, idx) => prisma.hitListStop.update({ where: { id: s.id }, data: { order: idx } })),
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
  await prisma.hitListStop.update({ where: { id: stopId }, data: { completedAt: now, skippedAt: null } });

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
