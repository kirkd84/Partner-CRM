/**
 * Multi-day route planner — core of the v2 hit-list flow.
 *
 * Takes:
 *   • A start (lat/lng + address) the rep leaves from each day.
 *   • A working-hours window (start/end minutes from midnight).
 *   • Optional lunch carve-out.
 *   • Per-stop visit duration (default 15 min).
 *   • Existing fixed-time appointments to fold in (calendar blocks).
 *   • A pool of partner stops (lat/lng + partnerId).
 *
 * Returns:
 *   • An ordered list of stops grouped by day, each with eta + leg
 *     distance/duration from the previous stop.
 *   • Day-level totals (drive time, work time, total minutes).
 *   • Plan-level totals.
 *
 * Algorithm:
 *   1. Greedy nearest-neighbor over the partner pool from the day's
 *      starting position. Each step asks: among the unvisited
 *      partners, what's the cheapest to drive to from the current
 *      cursor? Add it. Repeat.
 *   2. Whenever the projected ETA would push past endTimeMin (or
 *      collide with the lunch break / a fixed appointment), close
 *      out the current day and start the next one fresh from the
 *      home address.
 *   3. Existing appointments get inserted in their fixed time slot
 *      and the rep's cursor jumps to that location at the appointed
 *      time, then continues.
 *
 * Why nearest-neighbor + not Christofides / OR-Tools: for the typical
 * day (10–25 stops in one metro) NN is within ~10–15% of optimal and
 * runs in milliseconds. The Distance Matrix call is the bottleneck;
 * we make exactly one matrix call per planning run.
 */

import { getDistanceMatrix, haversineMi, type LatLng } from './distance-matrix';

export interface PlannerStop extends LatLng {
  /** Stable identifier — typically the Partner.id. */
  id: string;
  /** Optional minutes to spend here. Defaults to plan's minutesPerStop. */
  visitDurationMin?: number;
}

export interface FixedAppointment extends LatLng {
  id: string;
  startMinFromMidnight: number; // local minutes
  endMinFromMidnight: number;
  dayIndex: number; // which day in the plan this falls on (0 = day 1)
  label?: string;
}

export interface PlannerInput {
  startAddress: string;
  start: LatLng;
  /** END_AT_HOME = return to start each evening; LAST_STOP = end wherever the last partner is. */
  endMode: 'END_AT_HOME' | 'LAST_STOP';
  /** Optional alternate end address; only used for the FINAL day if endMode=END_AT_HOME and this differs from start. */
  end?: LatLng;
  /** Working-hours window in local minutes from midnight. Default 540 (9am) to 1020 (5pm). */
  startTimeMin?: number;
  endTimeMin?: number;
  /** Optional lunch break — null/undefined means no break. */
  lunchStartMin?: number;
  lunchDurationMin?: number;
  /** Default visit duration if a stop doesn't override. */
  minutesPerStop?: number;
  /** Hard cap on plan length so a 200-stop request doesn't fan out forever. */
  maxDays?: number;
  /** First day's date (UTC midnight) — subsequent days walk forward. */
  firstDay: Date;
  pool: PlannerStop[];
  /** Already-scheduled appointments to fold in. Each fixed at startMinFromMidnight on its dayIndex. */
  fixedAppointments?: FixedAppointment[];
}

export interface PlannerStopResult {
  partnerId: string;
  order: number;
  arrivalEta: Date;
  visitDurationMin: number;
  distanceFromPrevMi: number;
  durationFromPrevMin: number;
  /** True for fold-in appointments. */
  isAppointmentLock?: boolean;
  /** Free-form label (only for fixed appointments). */
  label?: string | null;
}

export interface PlannerDayResult {
  dayIndex: number;
  date: Date; // UTC midnight
  startsAt: Date;
  endsAt: Date;
  endsAtStart: boolean; // whether the rep drove home that night
  stops: PlannerStopResult[];
  totalMinutes: number;
  driveMinutes: number;
  visitMinutes: number;
  totalDistance: number;
}

export interface PlannerResult {
  days: PlannerDayResult[];
  totalStops: number;
  totalMinutes: number;
  totalDistance: number;
  unscheduled: string[];
}

const DEFAULT_MIN_PER_STOP = 15;
const DEFAULT_START_MIN = 9 * 60;
const DEFAULT_END_MIN = 17 * 60;
const DEFAULT_MAX_DAYS = 14;

export async function planRoute(input: PlannerInput): Promise<PlannerResult> {
  const minPerStop = input.minutesPerStop ?? DEFAULT_MIN_PER_STOP;
  const startTimeMin = input.startTimeMin ?? DEFAULT_START_MIN;
  const endTimeMin = input.endTimeMin ?? DEFAULT_END_MIN;
  const maxDays = input.maxDays ?? DEFAULT_MAX_DAYS;

  if (input.pool.length === 0) {
    return { days: [], totalStops: 0, totalMinutes: 0, totalDistance: 0, unscheduled: [] };
  }

  // Pre-compute distance matrix between (start, end, every-stop).
  // Origin/destination spaces are the same — we look up cells
  // bidirectionally.
  const points: LatLng[] = [input.start, ...input.pool];
  const { matrix } = await getDistanceMatrix(points, points);
  // matrix[0][k+1] = start → pool[k]; matrix[i+1][j+1] = pool[i] → pool[j]
  const STARTI = 0;
  const idxOfPoolStop = (i: number) => i + 1;
  const cell = (i: number, j: number) => {
    const row = matrix[i];
    if (!row) {
      // Shouldn't happen; defensive haversine fallback.
      return { distanceMi: 0, durationMin: 1 };
    }
    return row[j] ?? { distanceMi: 0, durationMin: 1 };
  };

  const remaining = new Set(input.pool.map((_, i) => i));
  const fixedByDay = new Map<number, FixedAppointment[]>();
  for (const a of input.fixedAppointments ?? []) {
    const arr = fixedByDay.get(a.dayIndex) ?? [];
    arr.push(a);
    fixedByDay.set(a.dayIndex, arr);
  }

  const days: PlannerDayResult[] = [];
  let dayIndex = 0;

  while (remaining.size > 0 && dayIndex < maxDays) {
    const dayDate = addDaysUtc(input.firstDay, dayIndex);
    const fixed = (fixedByDay.get(dayIndex) ?? []).sort(
      (a, b) => a.startMinFromMidnight - b.startMinFromMidnight,
    );

    // Cursor starts at home address at startTimeMin local on this day.
    let cursorIdx = STARTI;
    let cursorPoint: LatLng = input.start;
    let cursorMin = startTimeMin;
    const stopsToday: PlannerStopResult[] = [];
    let driveMin = 0;
    let visitMin = 0;
    let totalDist = 0;
    let order = 0;

    while (true) {
      // Insert any fixed appointments that come before our next greedy
      // pick. "Before" means: their start time is sooner than the
      // earliest possible arrival we could make to a partner stop.
      const nextFixed = fixed[0];
      // Decide what to do next.
      const candidate = pickNearest(remaining, cursorIdx, cell, idxOfPoolStop);
      if (!candidate && !nextFixed) break;

      // Earliest arrival for the candidate, in minutes from midnight.
      let projectedCandidateArrival = Number.POSITIVE_INFINITY;
      if (candidate) {
        const c = cell(cursorIdx, idxOfPoolStop(candidate.poolIndex));
        projectedCandidateArrival = cursorMin + c.durationMin;
        // Lunch carve-out: if the candidate would put us crossing the
        // lunch window, push the cursor past lunch first.
        if (
          input.lunchStartMin != null &&
          input.lunchDurationMin != null &&
          cursorMin < input.lunchStartMin &&
          projectedCandidateArrival > input.lunchStartMin
        ) {
          cursorMin = input.lunchStartMin + input.lunchDurationMin;
          projectedCandidateArrival = cursorMin + c.durationMin;
        }
      }

      // Take the fixed appointment if it comes first.
      if (
        nextFixed &&
        (!candidate || nextFixed.startMinFromMidnight <= projectedCandidateArrival)
      ) {
        // Drive from cursor to fixed appointment location.
        const driveMi = haversineMi(cursorPoint.lat, cursorPoint.lng, nextFixed.lat, nextFixed.lng);
        const driveDur = Math.max(1, Math.round((driveMi / 28) * 60));
        const arrival = nextFixed.startMinFromMidnight;
        const dur = Math.max(1, nextFixed.endMinFromMidnight - nextFixed.startMinFromMidnight);
        stopsToday.push({
          partnerId: nextFixed.id,
          order: order++,
          arrivalEta: dayMinutesToDate(dayDate, arrival),
          visitDurationMin: dur,
          distanceFromPrevMi: round1(driveMi),
          durationFromPrevMin: driveDur,
          isAppointmentLock: true,
          label: nextFixed.label ?? null,
        });
        driveMin += driveDur;
        visitMin += dur;
        totalDist += driveMi;
        cursorPoint = { lat: nextFixed.lat, lng: nextFixed.lng };
        cursorMin = nextFixed.endMinFromMidnight;
        // The cursor is now off-grid (not on any indexed stop). Set
        // cursorIdx to STARTI so the next greedy pick uses haversine
        // from this lat/lng — close enough for nearest-neighbor.
        cursorIdx = -1; // signal "use cursorPoint"
        fixed.shift();
        continue;
      }

      // Greedy partner pick.
      if (!candidate) break;
      const c = cell(cursorIdx === -1 ? STARTI : cursorIdx, idxOfPoolStop(candidate.poolIndex));
      const driveDur = c.durationMin;
      const driveMi = c.distanceMi;
      const stop = input.pool[candidate.poolIndex]!;
      const dur = stop.visitDurationMin ?? minPerStop;
      const arriveMin = projectedCandidateArrival;
      const leaveMin = arriveMin + dur;
      // If completing this stop would exceed the work day, also reject
      // if returning home from there would push past, when END_AT_HOME.
      const homeDriveMin = endMinDriveBack(cursorPoint, candidate, input);
      if (
        leaveMin > endTimeMin ||
        (input.endMode === 'END_AT_HOME' && leaveMin + homeDriveMin > endTimeMin + 60)
      ) {
        // Day is full.
        break;
      }
      stopsToday.push({
        partnerId: stop.id,
        order: order++,
        arrivalEta: dayMinutesToDate(dayDate, arriveMin),
        visitDurationMin: dur,
        distanceFromPrevMi: round1(driveMi),
        durationFromPrevMin: driveDur,
      });
      driveMin += driveDur;
      visitMin += dur;
      totalDist += driveMi;
      cursorPoint = { lat: stop.lat, lng: stop.lng };
      cursorIdx = idxOfPoolStop(candidate.poolIndex);
      cursorMin = leaveMin;
      remaining.delete(candidate.poolIndex);
    }

    if (stopsToday.length === 0 && fixed.length === 0) {
      // Couldn't fit anything — bail to avoid an infinite loop.
      break;
    }

    const startsAt = dayMinutesToDate(dayDate, startTimeMin);
    const endsAt = dayMinutesToDate(dayDate, cursorMin);
    const endsAtStart = input.endMode === 'END_AT_HOME' || dayIndex < maxDays - 1; // intra-trip days return home

    days.push({
      dayIndex,
      date: dayDate,
      startsAt,
      endsAt,
      endsAtStart,
      stops: stopsToday,
      totalMinutes: cursorMin - startTimeMin,
      driveMinutes: driveMin,
      visitMinutes: visitMin,
      totalDistance: round1(totalDist),
    });
    dayIndex++;
  }

  let totalStops = 0;
  let totalMinutes = 0;
  let totalDistance = 0;
  for (const d of days) {
    totalStops += d.stops.length;
    totalMinutes += d.totalMinutes;
    totalDistance += d.totalDistance;
  }
  const unscheduled = [...remaining].map((i) => input.pool[i]!.id);
  return {
    days,
    totalStops,
    totalMinutes,
    totalDistance: round1(totalDistance),
    unscheduled,
  };
}

interface NearestPick {
  poolIndex: number;
  durationMin: number;
}

function pickNearest(
  remaining: Set<number>,
  cursorIdx: number,
  cell: (i: number, j: number) => { distanceMi: number; durationMin: number },
  idxOfPoolStop: (i: number) => number,
): NearestPick | null {
  let best: NearestPick | null = null;
  for (const i of remaining) {
    const c = cell(cursorIdx === -1 ? 0 : cursorIdx, idxOfPoolStop(i));
    if (!best || c.durationMin < best.durationMin) {
      best = { poolIndex: i, durationMin: c.durationMin };
    }
  }
  return best;
}

function endMinDriveBack(_cursor: LatLng, candidate: NearestPick, input: PlannerInput): number {
  // Approximate drive-home from the candidate to start. Used for the
  // END_AT_HOME guardrail that prevents packing a day so tight the
  // rep doesn't have time to drive back to the office.
  const stop = input.pool[candidate.poolIndex]!;
  const mi = haversineMi(stop.lat, stop.lng, input.start.lat, input.start.lng);
  return Math.max(1, Math.round((mi / 28) * 60));
}

function dayMinutesToDate(dayUtcMidnight: Date, minutesFromMidnight: number): Date {
  return new Date(dayUtcMidnight.getTime() + minutesFromMidnight * 60_000);
}

function addDaysUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Return the N closest partners to a given location. */
export function pickClosest(
  origin: LatLng,
  pool: Array<PlannerStop>,
  count: number,
): PlannerStop[] {
  const scored = pool
    .map((p) => ({ p, mi: haversineMi(origin.lat, origin.lng, p.lat, p.lng) }))
    .sort((a, b) => a.mi - b.mi)
    .slice(0, Math.max(0, count));
  return scored.map((s) => s.p);
}
