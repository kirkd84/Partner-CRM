/**
 * Phase 8: Google Places adapter.
 *
 * Uses Places API (New) — Nearby Search — to pull candidate businesses
 * by partnerType + location + radius, normalizes them to ProspectCandidate
 * shape, and lets the base ingest runner dedupe + persist.
 *
 * Auth: pass in apiKey explicitly so the adapter has no hidden coupling
 * to env vars. The web-app caller looks up apiKey via `placesApiKey()`
 * (already used by the venue autocomplete proxy) so a single key powers
 * both flows.
 *
 * Rate limits: Places API allows ~10 QPS per key by default. We respect
 * pageToken cursors and back off 2s between page requests, which is
 * inside the limit even for parallel calls.
 */

import type { ProspectCandidate, ProspectPartnerType } from './types';

export type GooglePartnerType = ProspectPartnerType;

interface PlacesNewPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  shortFormattedAddress?: string;
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
}

interface PlacesNewResponse {
  places?: PlacesNewPlace[];
  nextPageToken?: string;
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Map our PartnerType to one or more Google `includedType` values.
 * Places API "Nearby Search (New)" requires types from a specific set
 * (https://developers.google.com/maps/documentation/places/web-service/place-types).
 */
const TYPE_MAP: Record<GooglePartnerType, string[]> = {
  REALTOR: ['real_estate_agency'],
  BROKER: ['real_estate_agency'],
  MORTGAGE_BROKER: ['mortgage_broker'],
  LOAN_OFFICER: ['mortgage_broker'],
  INSURANCE_AGENT: ['insurance_agency'],
  // Property managers + claims adjusters don't have direct Google types,
  // so we lean on real-estate / insurance and let the human reviewer
  // re-tag in the approval queue.
  PROPERTY_MANAGER: ['real_estate_agency'],
  CLAIMS_ADJUSTER: ['insurance_agency'],
  ATTORNEY: ['lawyer'],
  CONTRACTOR: ['general_contractor'],
  ROOFER: ['roofing_contractor'],
  OTHER: ['establishment'],
};

export interface GooglePlacesQuery {
  apiKey: string;
  partnerType: GooglePartnerType;
  /** Center of the search circle (decimal degrees). */
  centerLat: number;
  centerLng: number;
  /** Radius in miles, capped at 30 (Places caps at 50km). */
  radiusMi: number;
  /** Soft cap on total candidates returned. Default 60 = 3 pages. */
  maxResults?: number;
}

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.addressComponents',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.internationalPhoneNumber',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'nextPageToken',
].join(',');

/**
 * Async generator — yields ProspectCandidate objects until the soft cap
 * or no more pages. Errors abort the iteration so the runner records
 * how far it got.
 */
export async function* fetchGooglePlacesCandidates(
  q: GooglePlacesQuery,
): AsyncGenerator<ProspectCandidate, void, unknown> {
  const max = q.maxResults ?? 60;
  const radiusM = Math.min(50_000, q.radiusMi * 1609.34);
  const includedTypes = TYPE_MAP[q.partnerType] ?? ['establishment'];
  let yielded = 0;
  let pageToken: string | undefined;
  while (yielded < max) {
    const body: Record<string, unknown> = {
      includedTypes,
      maxResultCount: Math.min(20, max - yielded),
      locationRestriction: {
        circle: {
          center: { latitude: q.centerLat, longitude: q.centerLng },
          radius: radiusM,
        },
      },
    };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': q.apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Places ${res.status}: ${text.slice(0, 240)}`);
    }
    const data = (await res.json()) as PlacesNewResponse;
    if (data.error) {
      throw new Error(
        `Google Places ${data.error.status ?? data.error.code}: ${data.error.message ?? 'unknown'}`,
      );
    }
    for (const place of data.places ?? []) {
      const c = toCandidate(place, q.partnerType);
      if (c) {
        yield c;
        yielded++;
        if (yielded >= max) return;
      }
    }
    if (!data.nextPageToken) return;
    pageToken = data.nextPageToken;
    // Places caps page-token chaining; sleep briefly between pages.
    await sleep(2_000);
  }
}

function toCandidate(p: PlacesNewPlace, partnerType: GooglePartnerType): ProspectCandidate | null {
  const name = p.displayName?.text?.trim();
  if (!name) return null;
  const components = p.addressComponents ?? [];
  const pick = (type: string): string | undefined => {
    const c = components.find((cc) => (cc.types ?? []).includes(type));
    return c?.shortText?.trim() || c?.longText?.trim();
  };
  return {
    companyName: name,
    partnerType,
    address: p.shortFormattedAddress ?? p.formattedAddress ?? null,
    city: pick('locality') ?? null,
    state: pick('administrative_area_level_1') ?? null,
    zip: pick('postal_code') ?? null,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    sourceKey: p.id,
    raw: {
      provider: 'google-places-new',
      placeId: p.id,
      primaryType: p.primaryType,
      primaryTypeDisplay: p.primaryTypeDisplayName?.text,
      rating: p.rating,
      userRatingCount: p.userRatingCount,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
