/**
 * POST /api/places/autocomplete
 *
 * Thin server-side proxy in front of Google Places Autocomplete (New).
 * Keeps the Google API key server-side — client never sees it — and
 * reuses whichever key Kirk has already set:
 *
 *   • NEXT_PUBLIC_GOOGLE_PLACES_API_KEY (new, preferred)
 *   • GOOGLE_MAPS_API_KEY (existing, what Phase-4 map uses)
 *
 * Session token flows through so billing is per-session, not per-keystroke.
 *
 * Auth: login required — prevents random scrapers using our Google key.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { placesApiKey } from '@/lib/places/key';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const key = placesApiKey();
  if (!key) {
    return Response.json({ ok: false, reason: 'no_key', suggestions: [] });
  }

  const body = (await req.json().catch(() => null)) as {
    input?: string;
    sessionToken?: string;
  } | null;
  if (!body?.input || !body.input.trim()) {
    return Response.json({ ok: true, suggestions: [] });
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
      },
      body: JSON.stringify({
        input: body.input.trim(),
        sessionToken: body.sessionToken,
        // Don't restrict by type — we want venues AND addresses so Kirk
        // can search "Coors Field" OR "1000 Chopper Cir Denver".
      }),
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
      suggestions?: Array<{
        placePrediction?: {
          placeId: string;
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
          text?: { text?: string };
        };
      }>;
    };
    const suggestions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        placeId: p.placeId,
        mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
      }))
      .filter((s) => s.mainText);
    return Response.json({ ok: true, suggestions });
  } catch (err) {
    console.warn('[places-autocomplete]', err);
    return Response.json({ ok: false, reason: 'fetch_failed' });
  }
}
