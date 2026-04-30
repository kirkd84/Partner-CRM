/**
 * Distance Matrix wrapper for the v2 hit-list planner.
 *
 * Hits Google Distance Matrix for pairwise drive-time/drive-distance
 * between every (origin, destination) coord. Falls back to a
 * haversine + assumed-mph estimate when:
 *   • GOOGLE_MAPS_API_KEY (or GOOGLE_DIRECTIONS_API_KEY) isn't set.
 *   • The HTTP call fails for any reason.
 *
 * The fallback is intentionally conservative (28 mph average) so the
 * resulting day plans don't pack too aggressively and leave the rep
 * running late by 4pm. Real drive times almost always come in faster.
 *
 * Input/output indexing: matrix[i][j] = travel from origins[i] to
 * destinations[j].
 */

const EARTH_MI = 3958.8;
const ASSUMED_AVG_MPH = 28;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MatrixCell {
  distanceMi: number;
  durationMin: number;
}

export interface MatrixResult {
  matrix: MatrixCell[][];
  provider: 'google-distance-matrix' | 'haversine';
}

const GOOGLE_BATCH_LIMIT = 25; // pair limit per side per request

export async function getDistanceMatrix(
  origins: LatLng[],
  destinations: LatLng[],
): Promise<MatrixResult> {
  if (origins.length === 0 || destinations.length === 0) {
    return { matrix: [], provider: 'haversine' };
  }
  const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const m = await getMatrixViaGoogle(origins, destinations, apiKey);
      if (m) return m;
    } catch (err) {
      console.warn('[distance-matrix] google failed; falling back', err);
    }
  }
  return haversineMatrix(origins, destinations);
}

function haversineMatrix(origins: LatLng[], destinations: LatLng[]): MatrixResult {
  const matrix: MatrixCell[][] = [];
  for (const o of origins) {
    const row: MatrixCell[] = [];
    for (const d of destinations) {
      const mi = haversineMi(o.lat, o.lng, d.lat, d.lng);
      row.push({
        distanceMi: round1(mi),
        durationMin: Math.max(1, Math.round((mi / ASSUMED_AVG_MPH) * 60)),
      });
    }
    matrix.push(row);
  }
  return { matrix, provider: 'haversine' };
}

async function getMatrixViaGoogle(
  origins: LatLng[],
  destinations: LatLng[],
  apiKey: string,
): Promise<MatrixResult | null> {
  // Google's matrix API is capped at 25 origins × 25 destinations and
  // 100 elements per request. We chunk in 25×25 blocks and stitch.
  const out: MatrixCell[][] = origins.map(() =>
    destinations.map(() => ({ distanceMi: 0, durationMin: 0 })),
  );
  for (let oStart = 0; oStart < origins.length; oStart += GOOGLE_BATCH_LIMIT) {
    for (let dStart = 0; dStart < destinations.length; dStart += GOOGLE_BATCH_LIMIT) {
      const oSlice = origins.slice(oStart, oStart + GOOGLE_BATCH_LIMIT);
      const dSlice = destinations.slice(dStart, dStart + GOOGLE_BATCH_LIMIT);
      const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
      url.searchParams.set('origins', oSlice.map(toLatLngStr).join('|'));
      url.searchParams.set('destinations', dSlice.map(toLatLngStr).join('|'));
      url.searchParams.set('units', 'imperial');
      url.searchParams.set('mode', 'driving');
      url.searchParams.set('key', apiKey);
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const data = (await res.json()) as {
        status?: string;
        rows?: Array<{
          elements: Array<{
            status?: string;
            distance?: { value: number };
            duration?: { value: number };
          }>;
        }>;
      };
      if (data.status !== 'OK' || !data.rows) return null;
      for (let i = 0; i < oSlice.length; i++) {
        const row = data.rows[i]?.elements ?? [];
        for (let j = 0; j < dSlice.length; j++) {
          const e = row[j];
          const cell: MatrixCell =
            e?.status === 'OK' && e.distance && e.duration
              ? {
                  distanceMi: round1(e.distance.value / 1609.34),
                  durationMin: Math.max(1, Math.round(e.duration.value / 60)),
                }
              : haversineCell(oSlice[i]!, dSlice[j]!);
          out[oStart + i]![dStart + j] = cell;
        }
      }
    }
  }
  return { matrix: out, provider: 'google-distance-matrix' };
}

function haversineCell(a: LatLng, b: LatLng): MatrixCell {
  const mi = haversineMi(a.lat, a.lng, b.lat, b.lng);
  return {
    distanceMi: round1(mi),
    durationMin: Math.max(1, Math.round((mi / ASSUMED_AVG_MPH) * 60)),
  };
}

export function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toLatLngStr(p: LatLng): string {
  return `${p.lat},${p.lng}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
