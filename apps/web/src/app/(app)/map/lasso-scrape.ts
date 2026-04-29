'use server';

/**
 * Phase 4.4 lasso → scrape: take a hand-drawn polygon from the map,
 * search Google Places for businesses inside it (per partner type),
 * filter the results to those actually inside the polygon (not just
 * inside the bounding circle), and drop them into the existing
 * /admin/scraped-leads queue as ScrapedLead rows.
 *
 * Permissions: manager+ in the market the lasso belongs to. Reuses
 * `fetchGooglePlacesCandidates` from packages/integrations/ingest +
 * the same `placesApiKey()` Kirk already wired for venue autocomplete.
 *
 * Server-side point-in-polygon is a vanilla ray-cast — Google's
 * geometry helper only ships in the JS API, not the server SDK, so
 * we do it ourselves.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import {
  fetchGooglePlacesCandidates,
  runIngest,
  type GooglePartnerType,
} from '@partnerradar/integrations/ingest';
import { placesApiKey } from '@/lib/places/key';

export interface LassoScrapeInput {
  marketId: string;
  /** Polygon vertices in lat/lng order, closed by the caller (first ≈ last). */
  polygon: Array<{ lat: number; lng: number }>;
  partnerTypes: GooglePartnerType[];
  maxPerType?: number;
}

export interface LassoScrapeResult {
  jobId: string;
  fetched: number;
  insidePolygon: number;
  inserted: number;
  duplicates: number;
  errors: number;
  perType: Array<{
    partnerType: GooglePartnerType;
    fetched: number;
    inserted: number;
    /** Error message when the per-type scrape failed. Surfaced in the
     *  UI so reps know whether the cause is "no businesses match" vs
     *  "API key blew up". */
    error?: string;
  }>;
}

export async function scrapeLassoForLeads(input: LassoScrapeInput): Promise<LassoScrapeResult> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    throw new Error('FORBIDDEN');
  }
  if (session.user.role === 'MANAGER') {
    const markets = session.user.markets ?? [];
    if (!markets.includes(input.marketId)) throw new Error('FORBIDDEN: market');
  }
  if (input.polygon.length < 3) throw new Error('Lasso needs at least three points.');
  if (input.partnerTypes.length === 0) throw new Error('Pick at least one partner type to search.');

  const apiKey = placesApiKey();
  if (!apiKey) {
    throw new Error('Set GOOGLE_PLACES_API_KEY (or reuse GOOGLE_MAPS_API_KEY) on Railway.');
  }

  // Compute the polygon's bounding circle so we can ask Google Places
  // for everything in that area. We over-fetch slightly and then filter
  // to the exact polygon below.
  const center = polygonCentroid(input.polygon);
  const radiusMi = Math.min(30, polygonBoundingRadiusMi(input.polygon, center) * 1.1);

  // One job-name shared across the partner-type loop so runIngest's
  // find-or-create-by-(marketId, source, name) groups every lead under
  // a single ScrapeJob row. We bake the timestamp into the name so each
  // distinct lasso run gets its own row instead of all stacking onto
  // one ever-growing "Lasso scrape" job.
  //
  // Use ISO seconds so the same name is stable across the type loop
  // (the second iteration finds the job created in the first).
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const jobName = `Lasso scrape — ${stamp}`;

  const result: LassoScrapeResult = {
    jobId: '', // filled in after the first runIngest call
    fetched: 0,
    insidePolygon: 0,
    inserted: 0,
    duplicates: 0,
    errors: 0,
    perType: [],
  };

  // Run one Google Places search per partner type — types map to
  // distinct Google `includedTypes` (insurance_agency, real_estate_agency,
  // etc.) so we can't chain them in a single query.
  for (const partnerType of input.partnerTypes) {
    let typeFetched = 0;
    let typeInserted = 0;
    try {
      // Wrap the candidate stream so each candidate is gated on the
      // polygon test before runIngest writes it. Anything outside the
      // polygon — but still inside the bounding circle — is dropped.
      const filtered = filterByPolygon(
        fetchGooglePlacesCandidates({
          apiKey,
          partnerType,
          centerLat: center.lat,
          centerLng: center.lng,
          radiusMi,
          maxResults: input.maxPerType ?? 60,
        }),
        input.polygon,
        (kept) => {
          typeFetched++;
          if (kept) result.insidePolygon++;
        },
      );

      const ingest = await runIngest({
        prisma: prisma as unknown as Parameters<typeof runIngest>[0]['prisma'],
        marketId: input.marketId,
        source: 'GOOGLE_PLACES',
        jobName,
        createdBy: session.user.id,
        candidates: filtered,
      });

      // First successful runIngest call seeds the jobId; subsequent
      // calls in the loop find the same job and return the same id.
      if (!result.jobId) result.jobId = ingest.scrapeJobId;
      result.fetched += ingest.total;
      result.duplicates += ingest.duplicates;
      result.errors += ingest.errors;
      result.inserted += ingest.inserted;
      typeInserted = ingest.inserted;
      result.perType.push({ partnerType, fetched: typeFetched, inserted: typeInserted });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      console.warn('[lasso-scrape] type failed', { partnerType, err });
      result.errors++;
      // Bubble the cause up so the UI can show "no businesses found" vs
      // "GOOGLE_PLACES_API_KEY rejected" vs network blowup.
      result.perType.push({
        partnerType,
        fetched: typeFetched,
        inserted: typeInserted,
        error: msg,
      });
    }
  }

  // Stamp lastRunAt on the job so the /admin/scrape-jobs list orders
  // recent lasso runs ahead of dormant scheduled ones.
  if (result.jobId) {
    await prisma.scrapeJob.update({
      where: { id: result.jobId },
      data: {
        lastRunAt: new Date(),
        // Persist the polygon + types in `filters` so the admin can see
        // what was searched. runIngest stored an empty {} when it
        // first created the row.
        filters: {
          partnerTypes: input.partnerTypes,
          polygon: input.polygon,
          centerLat: center.lat,
          centerLng: center.lng,
          radiusMi,
        },
      },
    });
  }

  revalidatePath('/admin/scraped-leads');
  revalidatePath('/admin/scrape-jobs');
  return result;
}

// ─── Polygon math ────────────────────────────────────────────────────

/**
 * Wraps an async iterable of candidates and yields only those whose
 * lat/lng falls inside the polygon. Calls `onSeen(kept)` for every
 * candidate so the caller can keep counts.
 */
async function* filterByPolygon<C extends { lat?: number | null; lng?: number | null }>(
  source: AsyncIterable<C>,
  polygon: Array<{ lat: number; lng: number }>,
  onSeen: (kept: boolean) => void,
): AsyncGenerator<C, void, unknown> {
  for await (const c of source) {
    const inside =
      typeof c.lat === 'number' &&
      typeof c.lng === 'number' &&
      pointInPolygon(c.lat, c.lng, polygon);
    onSeen(inside);
    if (inside) yield c;
  }
}

/**
 * Standard ray-cast point-in-polygon. lat/lng treated as planar — fine
 * for territory-sized polygons (a few miles across). For polygons that
 * span hundreds of miles a great-circle test would be more correct,
 * but reps draw neighborhoods, not continents.
 */
function pointInPolygon(
  lat: number,
  lng: number,
  poly: Array<{ lat: number; lng: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.lng,
      yi = poly[i]!.lat;
    const xj = poly[j]!.lng,
      yj = poly[j]!.lat;
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonCentroid(poly: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  // Simple average — good enough as a "search around here" anchor for
  // Google Places. Geometric centroid would be more accurate but
  // requires signed-area math; the bounding-radius fudge factor below
  // covers the slop.
  let lat = 0,
    lng = 0;
  for (const p of poly) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / poly.length, lng: lng / poly.length };
}

function polygonBoundingRadiusMi(
  poly: Array<{ lat: number; lng: number }>,
  center: { lat: number; lng: number },
): number {
  // Greatest haversine distance from centroid to any vertex, in miles.
  let max = 0;
  for (const p of poly) {
    const d = haversineMi(center.lat, center.lng, p.lat, p.lng);
    if (d > max) max = d;
  }
  // Floor of 0.5 mi so a tiny lasso still grabs at least the local block.
  return Math.max(0.5, max);
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
