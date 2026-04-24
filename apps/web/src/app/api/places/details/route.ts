/**
 * GET /api/places/details?placeId=...&sessionToken=...
 *
 * Fetches the full place record from Google Places (New) — we call
 * this on selection to populate venue name + formatted address +
 * lat/lng in one round trip.
 *
 * See /api/places/autocomplete for the sister endpoint + key lookup.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { placesApiKey } from '@/lib/places/key';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const key = placesApiKey();
  if (!key) {
    return Response.json({ ok: false, reason: 'no_key' });
  }

  const placeId = req.nextUrl.searchParams.get('placeId');
  const sessionToken = req.nextUrl.searchParams.get('sessionToken') ?? '';
  if (!placeId) return Response.json({ ok: false, reason: 'missing_placeId' });

  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${
      sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ''
    }`;
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return Response.json({
        ok: false,
        reason: 'upstream_error',
        status: res.status,
        detail: text,
      });
    }
    const data = (await res.json()) as {
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    };
    return Response.json({
      ok: true,
      name: data.displayName?.text ?? null,
      address: data.formattedAddress ?? null,
      lat: data.location?.latitude ?? null,
      lng: data.location?.longitude ?? null,
    });
  } catch (err) {
    console.warn('[places-details]', err);
    return Response.json({ ok: false, reason: 'fetch_failed' });
  }
}
