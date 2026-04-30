'use server';

/**
 * Hit-list multi-day plan server actions.
 *
 * Flow:
 *   1. /lists/plans/new collects: start address (geocoded to lat/lng),
 *      partner pool (closest-N to a location, lasso, manual), config
 *      (work hours, lunch, minutes/stop, end mode).
 *   2. createPlan() runs lib/lists/route-planner.planRoute() and
 *      persists a HitListPlan parent + one HitList row per day with
 *      its HitListStop rows.
 *   3. The single-day detail at /lists/[id] renders each day with
 *      leg distance/duration + ETAs; /lists/plans/[id] shows the
 *      multi-day overview.
 *
 * Idempotency: the plan write uses a transaction so a partial DB
 * failure doesn't leave dangling rows.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import {
  planRoute,
  pickClosest,
  type PlannerStop,
  type FixedAppointment,
} from '@/lib/lists/route-planner';

export interface CreatePlanInput {
  marketId: string;
  label?: string;
  startAddress: string;
  startLat: number;
  startLng: number;
  endMode: 'END_AT_HOME' | 'LAST_STOP';
  minutesPerStop?: number;
  startTimeMin?: number;
  endTimeMin?: number;
  lunchStartMin?: number | null;
  lunchDurationMin?: number | null;
  /** Pick mode — closest-N or explicit list. */
  picker: { kind: 'closest'; count: number } | { kind: 'manual'; partnerIds: string[] };
  /** First day to schedule. ISO yyyy-mm-dd in the rep's local TZ. */
  firstDay: string;
  /** Maximum days to span. Default 7. */
  maxDays?: number;
  /** Whether to fold in already-scheduled appointments on those days. */
  foldInAppointments?: boolean;
}

async function assertCanPlan(marketId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (!session.user.markets.includes(marketId)) {
    throw new Error('FORBIDDEN: market not in your scope');
  }
  return session;
}

export async function createPlan(input: CreatePlanInput): Promise<{ id: string }> {
  const session = await assertCanPlan(input.marketId);
  const userId = session.user.id;

  // 1. Resolve the partner pool.
  const partners = await prisma.partner.findMany({
    where: {
      marketId: input.marketId,
      archivedAt: null,
      lat: { not: null },
      lng: { not: null },
      ...(input.picker.kind === 'manual'
        ? { id: { in: input.picker.partnerIds } }
        : { stage: { not: 'INACTIVE' } }),
    },
    select: {
      id: true,
      lat: true,
      lng: true,
      companyName: true,
    },
  });
  const fullPool: PlannerStop[] = partners
    .filter((p): p is typeof p & { lat: number; lng: number } => p.lat != null && p.lng != null)
    .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));

  let pool: PlannerStop[];
  if (input.picker.kind === 'closest') {
    pool = pickClosest({ lat: input.startLat, lng: input.startLng }, fullPool, input.picker.count);
  } else {
    // Honor the manager's order from the manual list when reasonable.
    const indexById = new Map(input.picker.partnerIds.map((id, idx) => [id, idx]));
    pool = [...fullPool].sort(
      (a, b) =>
        (indexById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (indexById.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }
  if (pool.length === 0) {
    throw new Error('No partners with coordinates matched the picker');
  }

  // 2. First-day midnight UTC (interpret YYYY-MM-DD as a local date).
  const parts = input.firstDay.split('-').map((n) => parseInt(n, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d) throw new Error('Invalid firstDay');
  const firstDayUtc = new Date(Date.UTC(y, m - 1, d));
  const maxDays = input.maxDays ?? 7;

  // 3. Optional fold-in of existing appointments.
  let fixedAppointments: FixedAppointment[] = [];
  if (input.foldInAppointments) {
    const horizon = new Date(firstDayUtc.getTime() + maxDays * 24 * 60 * 60 * 1000);
    const apts = await prisma.appointment
      .findMany({
        where: {
          userId,
          startsAt: { gte: firstDayUtc, lt: horizon },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          partner: { select: { id: true, lat: true, lng: true, companyName: true } },
          location: true,
        },
      })
      .catch(() => []);
    fixedAppointments = apts
      .filter((a) => a.partner?.lat != null && a.partner?.lng != null)
      .map((a) => {
        const dayIdx = Math.floor(
          (a.startsAt.getTime() - firstDayUtc.getTime()) / (24 * 60 * 60 * 1000),
        );
        const startMin = a.startsAt.getUTCHours() * 60 + a.startsAt.getUTCMinutes();
        const endMin =
          (a.endsAt ?? new Date(a.startsAt.getTime() + 60 * 60_000)).getUTCHours() * 60 +
          (a.endsAt ?? new Date(a.startsAt.getTime() + 60 * 60_000)).getUTCMinutes();
        return {
          id: `appt:${a.id}`,
          lat: a.partner!.lat!,
          lng: a.partner!.lng!,
          startMinFromMidnight: startMin,
          endMinFromMidnight: Math.max(endMin, startMin + 30),
          dayIndex: dayIdx,
          label: a.partner?.companyName ?? a.location ?? 'Appointment',
        };
      });
  }

  // 4. Run the planner.
  const result = await planRoute({
    startAddress: input.startAddress,
    start: { lat: input.startLat, lng: input.startLng },
    endMode: input.endMode,
    startTimeMin: input.startTimeMin,
    endTimeMin: input.endTimeMin,
    lunchStartMin: input.lunchStartMin ?? undefined,
    lunchDurationMin: input.lunchDurationMin ?? undefined,
    minutesPerStop: input.minutesPerStop,
    maxDays,
    firstDay: firstDayUtc,
    pool,
    fixedAppointments,
  });

  // 5. Persist plan + days + stops in one transaction.
  const plan = await prisma.$transaction(async (tx) => {
    const plan = await tx.hitListPlan.create({
      data: {
        userId,
        marketId: input.marketId,
        label: input.label?.trim() || null,
        startAddress: input.startAddress,
        startLat: input.startLat,
        startLng: input.startLng,
        endMode: input.endMode,
        minutesPerStop: input.minutesPerStop ?? 15,
        startTimeMin: input.startTimeMin ?? 540,
        endTimeMin: input.endTimeMin ?? 1020,
        lunchStartMin: input.lunchStartMin ?? null,
        lunchDurationMin: input.lunchDurationMin ?? null,
        totalStops: result.totalStops,
        totalDays: result.days.length,
        totalMinutes: result.totalMinutes,
        totalDistance: result.totalDistance,
        sourceKind: input.picker.kind === 'closest' ? `closest:${input.picker.count}` : 'manual',
        sourceMeta: input.picker as object,
      },
    });

    for (const day of result.days) {
      // Replace any existing hit-list for that user+date so a re-plan
      // doesn't blow up on the unique constraint. The old row's stops
      // cascade-delete with it.
      await tx.hitList.deleteMany({
        where: { userId, date: day.date },
      });
      const list = await tx.hitList.create({
        data: {
          userId,
          marketId: input.marketId,
          date: day.date,
          startAddress: input.startAddress,
          startLat: input.startLat,
          startLng: input.startLng,
          startMode: 'OFFICE',
          totalDistance: day.totalDistance,
          totalDuration: day.totalMinutes,
          planId: plan.id,
          dayIndex: day.dayIndex,
          minutesPerStop: input.minutesPerStop ?? 15,
          startTimeMin: input.startTimeMin ?? 540,
          endTimeMin: input.endTimeMin ?? 1020,
          lunchStartMin: input.lunchStartMin ?? null,
          lunchDurationMin: input.lunchDurationMin ?? null,
          endsAtStart: day.endsAtStart,
        },
      });
      // Skip fixed-appointment fold-ins (synthetic IDs starting with
      // `appt:`) — those don't get HitListStop rows; they're already
      // on the rep's calendar. Only persist real partner stops.
      const realStops = day.stops.filter((s) => !s.isAppointmentLock);
      for (const stop of realStops) {
        await tx.hitListStop.create({
          data: {
            hitListId: list.id,
            partnerId: stop.partnerId,
            order: stop.order,
            plannedArrival: stop.arrivalEta,
            plannedDurationMin: stop.visitDurationMin,
            distanceFromPrevMi: stop.distanceFromPrevMi,
            durationFromPrevMin: stop.durationFromPrevMin,
            arrivalEta: stop.arrivalEta,
          },
        });
      }
    }
    return plan;
  });

  revalidatePath('/lists');
  revalidatePath(`/lists/plans/${plan.id}`);
  return { id: plan.id };
}

/**
 * Push a hit list's stops onto the rep's connected Google Calendar.
 *
 * Each stop becomes a 30-min event at its arrivalEta (falling back to
 * plannedArrival), with location set to the partner's address. Skips
 * stops without geocoded data, already-completed stops, and rows
 * we've already pushed (CalendarEventCache lookup keyed on a synthetic
 * "hitlist:<stopId>" external id so re-running the action is safe).
 *
 * Returns counts so the UI can show the rep what happened. If the rep
 * has no Google connection, returns ok=false with reason="no_connection"
 * so the UI can prompt them to connect.
 */
export async function sendDayToCalendar(listId: string): Promise<{
  ok: boolean;
  created: number;
  skipped: number;
  reason?: string;
}> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const list = await prisma.hitList.findUnique({
    where: { id: listId },
    include: {
      stops: {
        orderBy: { order: 'asc' },
        include: {
          partner: {
            select: {
              id: true,
              companyName: true,
              address: true,
              city: true,
              state: true,
              zip: true,
            },
          },
        },
      },
    },
  });
  if (!list) return { ok: false, created: 0, skipped: 0, reason: 'list not found' };
  if (list.userId !== session.user.id) {
    // Managers can view other reps' lists, but only the rep should
    // push events to their own calendar.
    return {
      ok: false,
      created: 0,
      skipped: 0,
      reason: 'only the list owner can push to calendar',
    };
  }
  const conn = await prisma.calendarConnection.findFirst({
    where: { userId: session.user.id, provider: 'google' },
  });
  if (!conn) {
    return { ok: false, created: 0, skipped: 0, reason: 'no_connection' };
  }
  if (!conn.refreshTokenEncrypted) {
    return { ok: false, created: 0, skipped: 0, reason: 'no refresh token' };
  }

  // Lazy-import the encryption helper + token-refresh logic. Both are
  // only needed when a rep actually clicks "Send to calendar"; pulling
  // them in eagerly would balloon the page bundle.
  const { decryptSecret, isEncryptionConfigured } = await import('@partnerradar/integrations');
  if (!isEncryptionConfigured()) {
    return { ok: false, created: 0, skipped: 0, reason: 'ENCRYPTION_KEY not configured' };
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, created: 0, skipped: 0, reason: 'Google OAuth not configured' };
  }

  // Refresh the access token. Mirrors the pattern in
  // lib/jobs/google-calendar-sync.ts so a future refactor can share the
  // helper.
  let accessToken: string;
  try {
    const refreshToken = decryptSecret(conn.refreshTokenEncrypted);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        created: 0,
        skipped: 0,
        reason: `token refresh failed: ${res.status} ${text.slice(0, 100)}`,
      };
    }
    const payload = (await res.json()) as { access_token: string };
    accessToken = payload.access_token;
  } catch (err) {
    return {
      ok: false,
      created: 0,
      skipped: 0,
      reason: err instanceof Error ? err.message : 'token refresh failed',
    };
  }

  const calendarId = conn.calendarIds[0] ?? 'primary';
  let created = 0;
  let skipped = 0;
  for (const stop of list.stops) {
    if (stop.completedAt || stop.skippedAt) {
      skipped++;
      continue;
    }
    const externalId = `hitlist-${stop.id}`;
    const existing = await prisma.calendarEventCache
      .findFirst({
        where: { userId: session.user.id, externalEventId: externalId, provider: 'google' },
        select: { id: true },
      })
      .catch(() => null);
    if (existing) {
      skipped++;
      continue;
    }
    const start = stop.arrivalEta ?? stop.plannedArrival;
    const durationMin = stop.plannedDurationMin || 30;
    const end = new Date(start.getTime() + durationMin * 60_000);
    const location = [stop.partner.address, stop.partner.city, stop.partner.state, stop.partner.zip]
      .filter(Boolean)
      .join(', ');
    const body = {
      summary: `Hit list — ${stop.partner.companyName}`,
      description: `Planned visit from ${list.startAddress} via PartnerRadar.\nPartner: ${stop.partner.companyName}`,
      location: location || stop.partner.companyName,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      // Identifying tag so future runs can match + skip dupes.
      extendedProperties: {
        private: { partnerRadarStopId: stop.id, partnerRadarHitListId: list.id },
      },
    };
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        skipped++;
        continue;
      }
      const data = (await res.json()) as { id?: string };
      if (data.id) {
        await prisma.calendarEventCache
          .create({
            data: {
              userId: session.user.id,
              connectionId: conn.id,
              externalEventId: externalId,
              provider: 'google',
              title: body.summary,
              location: body.location,
              startsAt: start,
              endsAt: end,
            },
          })
          .catch(() => {});
        created++;
      }
    } catch {
      skipped++;
    }
  }
  revalidatePath(`/lists/${listId}`);
  return { ok: created > 0, created, skipped };
}

/**
 * Re-run the planner for an existing plan using its saved sourceMeta
 * + config. The original plan + its day rows are deleted in the same
 * transaction so we never end up with two stale plans pointing at
 * the same dates. Returns the new plan's id so the UI can navigate.
 *
 * Useful when partners get added/removed in the area between plan
 * builds — without this the rep has to delete + recreate by hand.
 */
export async function regeneratePlan(planId: string): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const plan = await prisma.hitListPlan.findUnique({
    where: { id: planId },
    include: { hitLists: { select: { date: true } } },
  });
  if (!plan) throw new Error('NOT_FOUND');
  if (plan.userId !== session.user.id) {
    const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
    if (!isManagerPlus) throw new Error('FORBIDDEN');
  }

  // Pull the original picker spec out of sourceMeta. Defaults handle
  // legacy rows where the field wasn't stored.
  const meta = (plan.sourceMeta ?? {}) as {
    kind?: 'closest' | 'manual';
    count?: number;
    partnerIds?: string[];
  };
  const picker: CreatePlanInput['picker'] =
    meta.kind === 'manual'
      ? { kind: 'manual', partnerIds: meta.partnerIds ?? [] }
      : { kind: 'closest', count: meta.count ?? 20 };

  // First day = the earliest day in the existing plan (so a re-plan
  // doesn't accidentally walk forward in time). If no days exist, fall
  // back to today.
  const earliest = plan.hitLists.reduce<Date | null>(
    (acc, l) => (acc == null || l.date.getTime() < acc.getTime() ? l.date : acc),
    null,
  );
  const firstDay = (earliest ?? new Date()).toISOString().slice(0, 10);

  // Delete the parent first; HitList rows have planId SetNull, so they
  // detach (their dates would otherwise collide with the rebuild's
  // unique constraint). We then deleteMany the orphaned-by-date rows
  // for this user before createPlan rebuilds.
  await prisma.$transaction([
    prisma.hitListPlan.delete({ where: { id: plan.id } }),
    prisma.hitList.deleteMany({
      where: {
        userId: plan.userId,
        date: { in: plan.hitLists.map((l) => l.date) },
      },
    }),
  ]);

  const r = await createPlan({
    marketId: plan.marketId,
    label: plan.label ?? undefined,
    startAddress: plan.startAddress,
    startLat: plan.startLat,
    startLng: plan.startLng,
    endMode: plan.endMode,
    minutesPerStop: plan.minutesPerStop,
    startTimeMin: plan.startTimeMin,
    endTimeMin: plan.endTimeMin,
    lunchStartMin: plan.lunchStartMin,
    lunchDurationMin: plan.lunchDurationMin,
    picker,
    firstDay,
    maxDays: Math.max(plan.totalDays, 1),
    // Best to re-fold appointments since the rep's calendar may have
    // shifted between builds.
    foldInAppointments: true,
  });
  revalidatePath('/lists');
  return r;
}

export async function deletePlan(planId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const plan = await prisma.hitListPlan.findUnique({
    where: { id: planId },
    select: { userId: true, marketId: true },
  });
  if (!plan) throw new Error('NOT_FOUND');
  const isOwner = plan.userId === session.user.id;
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  if (!isOwner && !isManagerPlus) throw new Error('FORBIDDEN');
  // Detach hit lists from the plan but keep them — the rep may still
  // want the day rows. SetNull on planId already covers this in the
  // schema; we then delete the plan parent.
  await prisma.hitListPlan.delete({ where: { id: planId } });
  revalidatePath('/lists');
  return { ok: true };
}
