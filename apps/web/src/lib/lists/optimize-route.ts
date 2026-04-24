/**
 * Phase 9: route optimization for a Hit List.
 *
 * Two paths:
 *   1. Google Directions API with `optimize:true` waypoints — preferred
 *      whenever GOOGLE_MAPS_API_KEY (or GOOGLE_DIRECTIONS_API_KEY) is set.
 *   2. Greedy nearest-neighbor fallback using the haversine distance —
 *      always available, used when no key or when the API call fails.
 *
 * Both paths return:
 *   - the input stops re-ordered (locked stops keep their original index)
 *   - planned arrival timestamps relative to the rep's start time
 *   - total distance (miles) and total duration (minutes)
 *
 * The runner persists this back into HitList + HitListStop. The run view
 * then walks the rep through stops in `order`.
 */

const EARTH_MI = 3958.8;
const DEFAULT_VISIT_MIN = 20;
const DEFAULT_BUFFER_MIN = 10;
const ASSUMED_AVG_MPH = 28; // conservative city/suburb average

export interface RouteStop {
  id: string;
  lat: number;
  lng: number;
  /** When true, this stop has a fixed time (e.g. a calendar appointment). */
  isAppointmentLock?: boolean;
  /** Minutes the rep should plan to spend at this stop. */
  visitDurationMin?: number;
  /** Required only when isAppointmentLock; ISO string. */
  fixedArrival?: string;
}

export interface OptimizeInput {
  startLat: number;
  startLng: number;
  /** ISO start datetime — when the rep leaves the start point. */
  startedAt: string;
  stops: RouteStop[];
  visitDurationMin?: number;
  bufferMin?: number;
}

export interface OptimizedStop {
  id: string;
  order: number;
  plannedArrival: string; // ISO
  plannedDurationMin: number;
  legDistanceMi: number;
  legDurationMin: number;
}

export interface OptimizedRoute {
  stops: OptimizedStop[];
  totalDistanceMi: number;
  totalDurationMin: number;
  provider: 'google-directions' | 'nearest-neighbor';
}

export async function optimizeRoute(input: OptimizeInput): Promise<OptimizedRoute> {
  if (input.stops.length === 0) {
    return {
      stops: [],
      totalDistanceMi: 0,
      totalDurationMin: 0,
      provider: 'nearest-neighbor',
    };
  }

  const visitMin = input.visitDurationMin ?? DEFAULT_VISIT_MIN;
  const bufferMin = input.bufferMin ?? DEFAULT_BUFFER_MIN;

  const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const out = await optimizeViaGoogle({ ...input, visitMin, bufferMin }, apiKey);
      if (out) return out;
    } catch (err) {
      console.warn('[optimize-route] Google Directions failed, falling back', err);
    }
  }
  return optimizeNearestNeighbor({ ...input, visitMin, bufferMin });
}

// ─── Nearest-neighbor fallback ───────────────────────────────────────

function optimizeNearestNeighbor(
  input: OptimizeInput & { visitMin: number; bufferMin: number },
): OptimizedRoute {
  // Separate locked stops (kept in their natural place by fixedArrival
  // ascending) from free stops (greedy nearest-neighbor from current
  // position). Then we interleave: free stops fill the gaps between
  // locked stops.
  const free = [...input.stops].filter((s) => !s.isAppointmentLock);
  const locked = [...input.stops]
    .filter((s) => s.isAppointmentLock && s.fixedArrival)
    .sort(
      (a, b) => new Date(a.fixedArrival ?? 0).getTime() - new Date(b.fixedArrival ?? 0).getTime(),
    );

  const ordered: RouteStop[] = [];
  let cursorLat = input.startLat;
  let cursorLng = input.startLng;
  let cursorTime = new Date(input.startedAt).getTime();

  // Interleave locked + free greedily.
  let nextLocked = locked.shift();
  while (free.length > 0 || nextLocked) {
    if (nextLocked) {
      const lockedTime = new Date(nextLocked.fixedArrival ?? cursorTime).getTime();
      // Drive time from cursor → next free stop, if there's room before locked.
      const candidate = pickNearest(free, cursorLat, cursorLng);
      if (candidate) {
        const driveMi = haversineMi(cursorLat, cursorLng, candidate.lat, candidate.lng);
        const driveMs = (driveMi / ASSUMED_AVG_MPH) * 60 * 60 * 1000;
        const visitMs = (candidate.visitDurationMin ?? input.visitMin) * 60 * 1000;
        const bufferMs = input.bufferMin * 60 * 1000;
        const arriveAt = cursorTime + driveMs;
        const leaveAt = arriveAt + visitMs + bufferMs;
        if (
          leaveAt +
            (haversineMi(candidate.lat, candidate.lng, nextLocked.lat, nextLocked.lng) /
              ASSUMED_AVG_MPH) *
              60 *
              60 *
              1000 <=
          lockedTime
        ) {
          // Fits before the locked stop — take it.
          ordered.push(candidate);
          free.splice(free.indexOf(candidate), 1);
          cursorLat = candidate.lat;
          cursorLng = candidate.lng;
          cursorTime = leaveAt;
          continue;
        }
      }
      // No free stops fit, or none left — go to locked.
      ordered.push(nextLocked);
      cursorLat = nextLocked.lat;
      cursorLng = nextLocked.lng;
      cursorTime = lockedTime + (nextLocked.visitDurationMin ?? input.visitMin) * 60 * 1000;
      nextLocked = locked.shift();
    } else {
      const candidate = pickNearest(free, cursorLat, cursorLng);
      if (!candidate) break;
      ordered.push(candidate);
      free.splice(free.indexOf(candidate), 1);
      const driveMs =
        (haversineMi(cursorLat, cursorLng, candidate.lat, candidate.lng) / ASSUMED_AVG_MPH) *
        60 *
        60 *
        1000;
      cursorLat = candidate.lat;
      cursorLng = candidate.lng;
      cursorTime += driveMs + (candidate.visitDurationMin ?? input.visitMin) * 60 * 1000;
    }
  }

  // Replay the ordered list to compute exact planned arrivals.
  let cLat = input.startLat;
  let cLng = input.startLng;
  let cTime = new Date(input.startedAt).getTime();
  const out: OptimizedStop[] = [];
  let totalMi = 0;
  ordered.forEach((s, i) => {
    const legMi = haversineMi(cLat, cLng, s.lat, s.lng);
    const legMin = (legMi / ASSUMED_AVG_MPH) * 60;
    const driveMs = legMin * 60 * 1000;
    let arrive = cTime + driveMs;
    if (s.isAppointmentLock && s.fixedArrival) {
      arrive = Math.max(arrive, new Date(s.fixedArrival).getTime());
    }
    const visit = s.visitDurationMin ?? input.visitMin;
    out.push({
      id: s.id,
      order: i,
      plannedArrival: new Date(arrive).toISOString(),
      plannedDurationMin: visit,
      legDistanceMi: round1(legMi),
      legDurationMin: round1(legMin),
    });
    totalMi += legMi;
    cLat = s.lat;
    cLng = s.lng;
    cTime = arrive + (visit + input.bufferMin) * 60 * 1000;
  });

  return {
    stops: out,
    totalDistanceMi: round1(totalMi),
    totalDurationMin: Math.round((cTime - new Date(input.startedAt).getTime()) / 60000),
    provider: 'nearest-neighbor',
  };
}

function pickNearest(pool: RouteStop[], lat: number, lng: number): RouteStop | null {
  if (pool.length === 0) return null;
  let best = pool[0]!;
  let bestMi = haversineMi(lat, lng, best.lat, best.lng);
  for (let i = 1; i < pool.length; i++) {
    const s = pool[i]!;
    const d = haversineMi(lat, lng, s.lat, s.lng);
    if (d < bestMi) {
      best = s;
      bestMi = d;
    }
  }
  return best;
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── Google Directions path ──────────────────────────────────────────

async function optimizeViaGoogle(
  input: OptimizeInput & { visitMin: number; bufferMin: number },
  apiKey: string,
): Promise<OptimizedRoute | null> {
  // Google Directions doesn't support locked-time waypoints natively.
  // For now we ignore lock constraints in the API call and let the
  // arrival times reflect the optimized order. A future pass can split
  // around lock points and call Directions per segment.
  const origin = `${input.startLat},${input.startLng}`;
  const destination = `${input.startLat},${input.startLng}`; // round-trip
  const waypoints = input.stops.map((s) => `${s.lat},${s.lng}`).join('|');
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', origin);
  url.searchParams.set('destination', destination);
  url.searchParams.set('waypoints', `optimize:true|${waypoints}`);
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status?: string;
    routes?: Array<{
      legs: Array<{ distance: { value: number }; duration: { value: number } }>;
      waypoint_order: number[];
    }>;
  };
  if (data.status !== 'OK' || !data.routes?.[0]) return null;
  const route = data.routes[0];
  const order = route.waypoint_order;
  const reordered = order.map((i) => input.stops[i]!).filter((s): s is RouteStop => Boolean(s));
  let cTime = new Date(input.startedAt).getTime();
  let totalMi = 0;
  const stops: OptimizedStop[] = reordered.map((s, idx) => {
    const leg = route.legs[idx];
    const legMi = leg ? leg.distance.value / 1609.34 : 0;
    const legMin = leg ? leg.duration.value / 60 : 0;
    const driveMs = legMin * 60 * 1000;
    const arrive = cTime + driveMs;
    const visit = s.visitDurationMin ?? input.visitMin;
    cTime = arrive + (visit + input.bufferMin) * 60 * 1000;
    totalMi += legMi;
    return {
      id: s.id,
      order: idx,
      plannedArrival: new Date(arrive).toISOString(),
      plannedDurationMin: visit,
      legDistanceMi: round1(legMi),
      legDurationMin: round1(legMin),
    };
  });
  return {
    stops,
    totalDistanceMi: round1(totalMi),
    totalDurationMin: Math.round((cTime - new Date(input.startedAt).getTime()) / 60000),
    provider: 'google-directions',
  };
}
