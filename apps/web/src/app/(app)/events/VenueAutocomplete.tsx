'use client';

/**
 * Google Places autocomplete for event venue selection.
 *
 * Uses the new Places Autocomplete (New) REST endpoints rather than
 * the legacy JS library — keeps the bundle small and avoids the
 * global script tag load dance. Two hits per search:
 *   1. Autocomplete → list of place suggestions
 *   2. Place Details → fills in address + lat/lng on selection
 *
 * Graceful without `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`: the component
 * silently degrades to two plain text inputs (name + address).
 *
 * Security note: the key is public (browser-visible) on purpose; Google
 * Cloud console is where we lock it down by referrer + API surface.
 */

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

interface Value {
  name: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
}

interface Props {
  valueName: string;
  valueAddress: string;
  onChange: (v: Value) => void;
}

interface Suggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

export function VenueAutocomplete({ valueName, valueAddress, onChange }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';
  const hasKey = apiKey.length > 0;
  const [query, setQuery] = useState(valueName || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Session token for Places: Google bills per-session instead of
  // per-request when we pass the same token on the autocomplete +
  // details calls. Refreshes on every new selection.
  const sessionTokenRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!hasKey) return;
    if (!query.trim() || query === valueName) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(query.trim(), sessionTokenRef.current, apiKey)
        .then((items) => {
          setSuggestions(items);
          setOpen(true);
        })
        .catch((err) => {
          console.warn('[places] autocomplete failed', err);
          setSuggestions([]);
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, valueName, apiKey, hasKey]);

  async function fetchSuggestions(
    input: string,
    sessionToken: string,
    key: string,
  ): Promise<Suggestion[]> {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
        },
        body: JSON.stringify({
          input,
          sessionToken,
        }),
      });
      if (!res.ok) return [];
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
      return (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({
          placeId: p.placeId,
          mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
        }))
        .filter((s) => s.mainText);
    } finally {
      setLoading(false);
    }
  }

  async function selectPlace(s: Suggestion) {
    setOpen(false);
    setQuery(s.mainText);
    if (!hasKey) return;
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(s.placeId)}?sessionToken=${encodeURIComponent(sessionTokenRef.current)}`,
        {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
          },
        },
      );
      const detail = (await res.json()) as {
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      };
      const name = detail.displayName?.text ?? s.mainText;
      const address = detail.formattedAddress ?? s.secondaryText;
      onChange({
        name,
        address,
        lat: detail.location?.latitude ?? null,
        lng: detail.location?.longitude ?? null,
      });
      setQuery(name);
      // New session token for the next search — bills as a new session.
      sessionTokenRef.current = crypto.randomUUID();
    } catch (err) {
      console.warn('[places] details failed', err);
      onChange({ name: s.mainText, address: s.secondaryText, lat: null, lng: null });
    }
  }

  if (!hasKey) {
    // No key → plain fallback so the event creator can still type venue by hand.
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={valueName}
          onChange={(e) => onChange({ name: e.target.value, address: valueAddress })}
          placeholder="Venue name (e.g. Ball Arena)"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <input
          type="text"
          value={valueAddress}
          onChange={(e) => onChange({ name: valueName, address: e.target.value })}
          placeholder="Address"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <p className="text-[11px] text-gray-400">
          Tip: set <code>NEXT_PUBLIC_GOOGLE_PLACES_API_KEY</code> to enable venue autocomplete with
          saved lat/lng.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange({ name: e.target.value, address: valueAddress });
          }}
          onFocus={() => setOpen(suggestions.length > 0)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search venues — Ball Arena, Sunset Restaurant…"
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
            …
          </span>
        ) : null}
      </div>
      {valueAddress && valueAddress !== query ? (
        <p className="mt-1 text-[11px] text-gray-500">{valueAddress}</p>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPlace(s)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-900">{s.mainText}</span>
                  {s.secondaryText ? (
                    <span className="block truncate text-[11px] text-gray-500">
                      {s.secondaryText}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
