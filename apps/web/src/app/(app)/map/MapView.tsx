'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Pill } from '@partnerradar/ui';
import {
  PARTNER_TYPE_LABELS,
  STAGE_COLORS,
  STAGE_LABELS,
  type PartnerStage,
  type PartnerType,
} from '@partnerradar/types';
import { AlertTriangle, ExternalLink, Lasso, Loader2, Trash2 } from 'lucide-react';
import { createHitListWithStops } from '../lists/actions';

interface MapPartner {
  id: string;
  publicId: string;
  companyName: string;
  partnerType: PartnerType;
  stage: PartnerStage;
  lat: number;
  lng: number;
  city: string | null;
  state: string | null;
}

// Keep in sync with STAGE_COLORS — pin color hex for Google Maps markers.
const STAGE_PIN_HEX: Record<PartnerStage, string> = {
  NEW_LEAD: '#64748b', // slate
  CONTACTED: '#3b82f6', // blue
  MEETING_SET: '#8b5cf6', // violet
  PROPOSAL_SENT: '#eab308', // yellow
  ACTIVATED: '#10b981', // emerald
  DORMANT: '#f97316', // orange
  DO_NOT_CONTACT: '#ef4444', // red
};

/**
 * Loads the Google Maps JS API once on mount and renders partner pins.
 * If the script fails to load (bad key / network), falls back to a list
 * view so the page is always usable.
 */
export function MapView({
  apiKey,
  defaultCenter,
  partners,
  marketId,
}: {
  apiKey: string;
  defaultCenter: { lat: number; lng: number };
  partners: MapPartner[];
  marketId: string | null;
}) {
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<unknown>(null);
  const drawingManager = useRef<unknown>(null);
  const activePolygon = useRef<unknown>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<MapPartner | null>(null);
  const [lassoActive, setLassoActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savingList, setSavingList] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps]');
    if (existing) {
      if ((window as any).google?.maps) {
        setStatus('ready');
      } else {
        existing.addEventListener('load', () => !cancelled && setStatus('ready'));
        existing.addEventListener('error', () => !cancelled && setStatus('error'));
      }
      return () => {
        cancelled = true;
      };
    }
    const script = document.createElement('script');
    // NOTE: NO `loading=async` query param — that flag switches Google
    // Maps into a lazy "importLibrary()" mode where symbols like
    // `google.maps.LatLngBounds` aren't immediately available on the
    // global. We use those symbols directly below, so stay on the
    // legacy eager loader.
    // geometry adds containsLocation for the lasso point-in-polygon test;
    // drawing gives us the polygon DrawingManager.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=drawing,geometry,places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = '1';
    script.addEventListener('load', () => !cancelled && setStatus('ready'));
    script.addEventListener('error', () => !cancelled && setStatus('error'));
    document.head.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return;
    const google = (window as any).google;
    // Defend against the lazy-loader case where google.maps exists but
    // its constructors haven't attached yet. Re-run once they're live.
    if (
      !google?.maps ||
      typeof google.maps.LatLngBounds !== 'function' ||
      typeof google.maps.Map !== 'function'
    ) {
      const t = window.setTimeout(() => setStatus((s) => (s === 'ready' ? 'ready' : s)), 150);
      return () => window.clearTimeout(t);
    }

    const bounds = new google.maps.LatLngBounds();
    const map = new google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
    mapInstance.current = map;

    const markers: any[] = [];
    for (const p of partners) {
      const pos = { lat: p.lat, lng: p.lng };
      const marker = new google.maps.Marker({
        map,
        position: pos,
        title: p.companyName,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: STAGE_PIN_HEX[p.stage],
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      marker.addListener('click', () => setSelected(p));
      markers.push(marker);
      bounds.extend(pos);
    }

    if (markers.length > 0) {
      map.fitBounds(bounds);
      const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > 14) map.setZoom(14);
      });
      return () => {
        markers.forEach((m) => m.setMap(null));
        google.maps.event.removeListener(listener);
      };
    }

    return () => {
      markers.forEach((m) => m.setMap(null));
    };
  }, [status, defaultCenter, partners]);

  // Lasso drawing: enable/disable the DrawingManager based on the toggle.
  // When a polygon is closed we run point-in-polygon over the partner pins
  // and store the resulting set of partner IDs in state.
  useEffect(() => {
    if (status !== 'ready' || !mapInstance.current) return;
    const google = (window as { google?: typeof globalThis & Record<string, unknown> }).google as
      | undefined
      | { maps: typeof globalThis & Record<string, unknown> };
    if (!google?.maps) return;
    const gmaps = google.maps as unknown as {
      drawing?: {
        DrawingManager: new (opts: unknown) => {
          setMap: (m: unknown) => void;
          setDrawingMode: (mode: unknown) => void;
        };
        OverlayType: { POLYGON: unknown };
      };
      ControlPosition: { TOP_CENTER: unknown };
      event: {
        addListener: (target: unknown, name: string, fn: (...args: unknown[]) => void) => unknown;
        removeListener: (l: unknown) => void;
      };
      geometry?: {
        poly: { containsLocation: (point: unknown, polygon: unknown) => boolean };
      };
      LatLng: new (lat: number, lng: number) => unknown;
    };
    if (!gmaps.drawing?.DrawingManager || !gmaps.geometry?.poly?.containsLocation) return;

    const dm = new gmaps.drawing.DrawingManager({
      drawingControl: false,
      polygonOptions: {
        fillColor: '#F2903A',
        fillOpacity: 0.18,
        strokeColor: '#F2903A',
        strokeOpacity: 0.9,
        strokeWeight: 2,
        editable: true,
        clickable: false,
        zIndex: 50,
      },
    });
    dm.setMap(mapInstance.current);
    drawingManager.current = dm;

    const completeListener = gmaps.event.addListener(
      dm as unknown,
      'polygoncomplete',
      (...args: unknown[]) => {
        const polygon = args[0] as {
          setMap: (m: unknown) => void;
          getPath: () => { addListener?: (n: string, f: () => void) => unknown };
        };
        // Replace any previous polygon — one lasso at a time is plenty
        // and the panel below sums up what's inside.
        const prev = activePolygon.current as { setMap: (m: unknown) => void } | null;
        if (prev) prev.setMap(null);
        activePolygon.current = polygon;
        // Stop drawing — toggle returns to "off" once the user closes the
        // shape, mirroring how Photoshop's lasso works.
        dm.setDrawingMode(null);
        setLassoActive(false);

        const recompute = () => {
          const inside = new Set<string>();
          for (const p of partners) {
            const pt = new gmaps.LatLng(p.lat, p.lng);
            if (gmaps.geometry!.poly.containsLocation(pt, polygon)) inside.add(p.id);
          }
          setSelectedIds(inside);
        };
        recompute();

        // If the user edits the polygon vertices, re-run the count.
        const path = polygon.getPath() as unknown as {
          addListener?: (name: string, fn: () => void) => unknown;
        };
        if (path?.addListener) {
          path.addListener('insert_at', recompute);
          path.addListener('set_at', recompute);
          path.addListener('remove_at', recompute);
        }
      },
    );

    return () => {
      gmaps.event.removeListener(completeListener);
      dm.setMap(null);
      drawingManager.current = null;
    };
  }, [status, partners]);

  // React to the toggle: kick the drawing manager into / out of polygon mode.
  useEffect(() => {
    const dm = drawingManager.current as { setDrawingMode: (mode: unknown) => void } | null;
    const google = (window as { google?: { maps: Record<string, unknown> } }).google;
    if (!dm || !google?.maps) return;
    const drawing = google.maps.drawing as { OverlayType?: { POLYGON: unknown } } | undefined;
    if (!drawing?.OverlayType) return;
    dm.setDrawingMode(lassoActive ? drawing.OverlayType.POLYGON : null);
  }, [lassoActive]);

  function clearLasso() {
    const polygon = activePolygon.current as { setMap: (m: unknown) => void } | null;
    if (polygon) polygon.setMap(null);
    activePolygon.current = null;
    setSelectedIds(new Set());
    setSaveMsg(null);
  }

  function onSaveAsHitList() {
    if (!marketId) {
      setSaveMsg('Pick a market with at least one partner first.');
      return;
    }
    if (selectedIds.size === 0) return;
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setSavingList(true);
    setSaveMsg(null);
    startTransition(async () => {
      try {
        const result = await createHitListWithStops({
          marketId,
          date,
          partnerIds: [...selectedIds],
          startMode: 'OFFICE',
        });
        clearLasso();
        router.push(`/lists/${result.id}`);
      } catch (err) {
        setSaveMsg(err instanceof Error ? err.message : 'Could not save hit list');
      } finally {
        setSavingList(false);
      }
    });
  }

  // Pre-compute selected partners + their stage/type breakdowns for the panel.
  const selectedPartners = useMemo(
    () => partners.filter((p) => selectedIds.has(p.id)),
    [partners, selectedIds],
  );
  const breakdownByStage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of selectedPartners) m[p.stage] = (m[p.stage] ?? 0) + 1;
    return m;
  }, [selectedPartners]);
  const breakdownByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of selectedPartners) m[p.partnerType] = (m[p.partnerType] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [selectedPartners]);

  if (status === 'error') {
    return (
      <Card>
        <div className="flex items-start gap-3 py-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div className="text-sm">
            <div className="font-semibold text-gray-900">Could not load Google Maps</div>
            <div className="text-xs text-gray-600">
              The key is present but the script failed to load. Check billing, referrer
              restrictions, and that the Maps JS API is enabled.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
      <div className="relative h-[600px] overflow-hidden rounded-lg border border-card-border bg-white shadow-card">
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Loading map…
          </div>
        )}
        <div ref={mapRef} className={`h-full w-full ${status === 'loading' ? 'hidden' : ''}`} />

        {/* Lasso toolbar — floats above the map. Mobile-friendly: thumb-reachable in the top-left. */}
        {status === 'ready' && (
          <div className="absolute left-2 top-2 z-10 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (lassoActive) {
                  setLassoActive(false);
                } else {
                  clearLasso();
                  setLassoActive(true);
                }
              }}
              title={
                lassoActive
                  ? 'Cancel — click again or finish the polygon by clicking the first point'
                  : 'Draw a lasso to select partners inside a territory'
              }
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition ${
                lassoActive
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary'
              }`}
            >
              <Lasso className="h-3.5 w-3.5" />
              {lassoActive ? 'Drawing… click first point to close' : 'Lasso a territory'}
            </button>
            {selectedIds.size > 0 && !lassoActive && (
              <button
                type="button"
                onClick={clearLasso}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition hover:border-red-300 hover:text-red-600"
              >
                <Trash2 className="h-3 w-3" /> Clear lasso
              </button>
            )}
          </div>
        )}
      </div>
      <aside className="flex flex-col gap-3">
        {selectedIds.size > 0 && (
          <Card
            title={
              <span className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <Lasso className="h-3.5 w-3.5 text-primary" />
                  Lasso · {selectedIds.size} partner{selectedIds.size === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={clearLasso}
                  className="text-[11px] text-gray-400 hover:text-red-600"
                >
                  Clear
                </button>
              </span>
            }
          >
            {/* Stage breakdown */}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(breakdownByStage).map(([stage, count]) => (
                <Pill key={stage} tone="soft" color={STAGE_COLORS[stage as PartnerStage] ?? 'gray'}>
                  {STAGE_LABELS[stage as PartnerStage] ?? stage}: {count}
                </Pill>
              ))}
            </div>

            {/* Type breakdown — top 4, then "+ more" */}
            {breakdownByType.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                {breakdownByType.slice(0, 6).map(([type, count]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between truncate text-gray-600"
                  >
                    <span className="truncate">
                      {PARTNER_TYPE_LABELS[type as PartnerType] ?? type}
                    </span>
                    <span className="ml-2 font-mono tabular-nums text-gray-900">{count}</span>
                  </div>
                ))}
                {breakdownByType.length > 6 && (
                  <div className="text-[11px] text-gray-400">
                    + {breakdownByType.length - 6} more types
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={onSaveAsHitList}
                disabled={savingList || !marketId}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingList ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save as today&apos;s hit list
              </button>
              {!marketId && (
                <span className="text-[10px] text-gray-500">
                  Pick a market in your profile to save lists.
                </span>
              )}
            </div>
            {saveMsg && <p className="mt-2 text-[11px] text-amber-700">{saveMsg}</p>}
          </Card>
        )}

        {selected ? (
          <Card title={selected.companyName}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-gray-400">{selected.publicId}</span>
                <Pill tone="soft" color={STAGE_COLORS[selected.stage]}>
                  {STAGE_LABELS[selected.stage]}
                </Pill>
              </div>
              <div className="text-xs text-gray-600">
                {PARTNER_TYPE_LABELS[selected.partnerType]}
              </div>
              {(selected.city || selected.state) && (
                <div className="text-xs text-gray-500">
                  {selected.city}
                  {selected.state ? `, ${selected.state}` : ''}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Link
                  href={`/partners/${selected.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary hover:bg-blue-50"
                >
                  Open partner
                </Link>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink className="h-3 w-3" /> Open in Google Maps
                </a>
              </div>
            </div>
          </Card>
        ) : (
          <Card title="Click a pin">
            <p className="text-xs text-gray-500">
              Partner details show up here. Pin color = stage: grey NEW_LEAD, blue CONTACTED, violet
              MEETING_SET, yellow PROPOSAL, emerald ACTIVATED, orange DORMANT, red DO_NOT_CONTACT.
            </p>
          </Card>
        )}
      </aside>
    </div>
  );
}
