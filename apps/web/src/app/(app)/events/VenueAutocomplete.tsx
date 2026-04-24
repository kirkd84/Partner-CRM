'use client';

/**
 * Two-field venue picker backed by Google Places (New) via our own
 * /api/places/* proxy so the API key stays server-side and we reuse
 * Kirk's existing GOOGLE_MAPS_API_KEY.
 *
 * Behaviour:
 *   • Venue NAME field autocompletes against Places (biased toward
 *     establishments, so typing "coors field" surfaces Coors Field
 *     with address in the suggestion).
 *   • Address field ALSO autocompletes against Places (so typing
 *     "1000 Chopper Cir" offers the formatted address with lat/lng).
 *   • Picking a suggestion from either field fills BOTH fields and
 *     records lat/lng on the event.
 *
 * When the server reports no key (`{ ok:false, reason:'no_key' }`),
 * both fields silently degrade to plain text inputs. No tip banner —
 * Kirk was rightly annoyed that the old banner kept showing when he
 * had a key but our client-side env check couldn't see it.
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

type Focus = 'name' | 'address' | null;

export function VenueAutocomplete({ valueName, valueAddress, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [focus, setFocus] = useState<Focus>(null);
  const [loading, setLoading] = useState(false);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Current query we should feed the API: whichever field the user is
  // actively typing into. We never search both at once.
  const query = focus === 'name' ? valueName : focus === 'address' ? valueAddress : '';

  useEffect(() => {
    if (!focus) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const text = query.trim();
    if (text.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(text, sessionTokenRef.current);
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, focus]);

  async function fetchSuggestions(input: string, sessionToken: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch('/api/places/autocomplete', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, sessionToken }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        reason?: string;
        suggestions?: Suggestion[];
      };
      if (data.reason === 'no_key') {
        setApiAvailable(false);
        setSuggestions([]);
        return;
      }
      setApiAvailable(true);
      setSuggestions(data.suggestions ?? []);
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        console.warn('[venue] autocomplete failed', err);
      }
    } finally {
      setLoading(false);
    }
  }

  async function selectPlace(s: Suggestion) {
    setFocus(null);
    setSuggestions([]);
    try {
      const res = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(s.placeId)}&sessionToken=${encodeURIComponent(sessionTokenRef.current)}`,
      );
      const data = (await res.json()) as {
        ok: boolean;
        name?: string;
        address?: string;
        lat?: number | null;
        lng?: number | null;
      };
      if (data.ok) {
        onChange({
          name: data.name ?? s.mainText,
          address: data.address ?? s.secondaryText,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
        });
      } else {
        // Server said no — best-effort fill from the suggestion's
        // main/secondary text so Kirk still gets something useful.
        onChange({
          name: s.mainText,
          address: s.secondaryText,
          lat: null,
          lng: null,
        });
      }
      sessionTokenRef.current = crypto.randomUUID();
    } catch (err) {
      console.warn('[venue] details failed', err);
      onChange({
        name: s.mainText,
        address: s.secondaryText,
        lat: null,
        lng: null,
      });
    }
  }

  const showDropdown = focus !== null && suggestions.length > 0;

  return (
    <div className="relative space-y-2">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={valueName}
          onFocus={() => setFocus('name')}
          onBlur={() => setTimeout(() => setFocus(null), 150)}
          onChange={(e) => onChange({ name: e.target.value, address: valueAddress })}
          placeholder="Venue name (Coors Field, The Chop House, …)"
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {focus === 'name' && loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
            …
          </span>
        ) : null}
      </div>

      <div className="relative">
        <input
          type="text"
          value={valueAddress}
          onFocus={() => setFocus('address')}
          onBlur={() => setTimeout(() => setFocus(null), 150)}
          onChange={(e) => onChange({ name: valueName, address: e.target.value })}
          placeholder="Address (1000 Chopper Cir, Denver, CO)"
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {focus === 'address' && loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
            …
          </span>
        ) : null}
      </div>

      {showDropdown ? (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
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

      {apiAvailable === false ? (
        <p className="text-[11px] text-gray-500">
          Places autocomplete isn't available — add <code>GOOGLE_MAPS_API_KEY</code> on Railway with
          Places API (New) enabled. You can still type venue + address by hand.
        </p>
      ) : null}
    </div>
  );
}
