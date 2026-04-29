'use client';

/**
 * Lasso → scrape Google Places. Lives in its own page so the main /map
 * stays focused on existing partners + Hit Lists. We deliberately
 * duplicate the Google Maps boot logic from MapView (rather than
 * extracting a shared hook) because:
 *
 *   - Both surfaces need to mount + clean up their own DrawingManager
 *     and polygon, and a shared hook would force consumers to thread
 *     refs through props.
 *   - This page has no partner pins, no "save as Hit List", no
 *     selectedIds — just a blank canvas the rep draws on.
 *   - Once we know the shape of the second use case we can extract.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Card, Pill } from '@partnerradar/ui';
import { ArrowRight, Lasso, Loader2, MapPin, Sparkles, Trash2 } from 'lucide-react';
import { scrapeLassoForLeads, type LassoScrapeResult } from '../../map/lasso-scrape';
import type { GooglePartnerType } from '@partnerradar/integrations/ingest';

// Google Places API (New) — Table A type set. Only show types Google
// will actually accept; everything else 400s the entire lasso run.
//
// Notable omissions:
//   • Mortgage brokers / loan officers — no Google place type. Use the
//     State Boards CSV import (NMLS) instead; it's exhaustive and free.
//   • General contractors — Google doesn't have `general_contractor`
//     as a Table A type. We surface ROOFER (roofing_contractor) and
//     leave the rest to manual entry / industry-specific sources.
const SCRAPE_TYPE_OPTIONS: Array<{ key: GooglePartnerType; label: string }> = [
  { key: 'REALTOR', label: 'Realtors' },
  { key: 'INSURANCE_AGENT', label: 'Insurance' },
  { key: 'PROPERTY_MANAGER', label: 'Property Mgmt' },
  { key: 'ATTORNEY', label: 'Attorneys' },
  { key: 'ROOFER', label: 'Roofers' },
];

export function LassoBuilder({
  apiKey,
  marketId,
  marketName,
  defaultCenter,
}: {
  apiKey: string;
  marketId: string;
  marketName: string;
  defaultCenter: { lat: number; lng: number };
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<unknown>(null);
  const drawingManager = useRef<unknown>(null);
  const activePolygon = useRef<unknown>(null);
  // Pin+radius mode — alternative to polygon-lasso. Click the map to
  // drop a center pin; drag the slider to size the circle. We
  // approximate the circle as a 32-vertex polygon so the existing
  // server action (which does point-in-polygon) keeps working
  // unchanged.
  const pinMarker = useRef<unknown>(null);
  const circleOverlay = useRef<unknown>(null);
  const mapClickListener = useRef<unknown>(null);
  const [mode, setMode] = useState<'polygon' | 'pin'>('polygon');
  const [pinCenter, setPinCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [pinRadiusMi, setPinRadiusMi] = useState<number>(2);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [lassoActive, setLassoActive] = useState(false);
  const [hasLasso, setHasLasso] = useState(false);
  const [, startTransition] = useTransition();

  // Default to Realtors + Insurance — Roof Tech's bread-and-butter.
  const [scrapeTypes, setScrapeTypes] = useState<Set<GooglePartnerType>>(
    () => new Set<GooglePartnerType>(['REALTOR', 'INSURANCE_AGENT']),
  );
  const [scrapeRunning, setScrapeRunning] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<LassoScrapeResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // Boot the Maps JS API. Same gotcha as MapView: stay off
  // `loading=async` so `google.maps.LatLngBounds` is on the global.
  useEffect(() => {
    let cancelled = false;
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps]');
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Mount the map once the API is ready.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google;
    if (
      !google?.maps ||
      typeof google.maps.LatLngBounds !== 'function' ||
      typeof google.maps.Map !== 'function'
    ) {
      const t = window.setTimeout(() => setStatus((s) => (s === 'ready' ? 'ready' : s)), 150);
      return () => window.clearTimeout(t);
    }
    const map = new google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
    mapInstance.current = map;
  }, [status, defaultCenter]);

  // Mount the DrawingManager when the map is ready. Polygon orange so
  // it visually matches Roof Tech's hit-list color language.
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
      event: {
        addListener: (target: unknown, name: string, fn: (...args: unknown[]) => void) => unknown;
        removeListener: (l: unknown) => void;
      };
    };
    if (!gmaps.drawing?.DrawingManager) return;

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
        const polygon = args[0] as { setMap: (m: unknown) => void };
        const prev = activePolygon.current as { setMap: (m: unknown) => void } | null;
        if (prev) prev.setMap(null);
        activePolygon.current = polygon;
        dm.setDrawingMode(null);
        setLassoActive(false);
        setHasLasso(true);
        setScrapeResult(null);
        setScrapeError(null);
      },
    );

    return () => {
      gmaps.event.removeListener(completeListener);
      dm.setMap(null);
      drawingManager.current = null;
    };
  }, [status]);

  // Toggle drawing mode in response to the lasso button.
  useEffect(() => {
    const dm = drawingManager.current as { setDrawingMode: (mode: unknown) => void } | null;
    const google = (window as { google?: { maps: Record<string, unknown> } }).google;
    if (!dm || !google?.maps) return;
    const drawing = google.maps.drawing as { OverlayType?: { POLYGON: unknown } } | undefined;
    if (!drawing?.OverlayType) return;
    // Polygon drawing only fires when we're in polygon mode AND the
    // toolbar lasso button is active. Pin mode never enables polygon.
    dm.setDrawingMode(mode === 'polygon' && lassoActive ? drawing.OverlayType.POLYGON : null);
  }, [lassoActive, mode]);

  // Pin mode — listen for map clicks to set the center pin. Tear down
  // the listener when leaving pin mode.
  useEffect(() => {
    if (status !== 'ready' || !mapInstance.current) return;
    if (mode !== 'pin') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      if (mapClickListener.current && g?.maps?.event) {
        g.maps.event.removeListener(mapClickListener.current);
      }
      mapClickListener.current = null;
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    if (!g?.maps?.event) return;
    const handler = (...args: unknown[]) => {
      const ev = args[0] as { latLng?: { lat: () => number; lng: () => number } };
      const ll = ev?.latLng;
      if (!ll) return;
      const center = { lat: ll.lat(), lng: ll.lng() };
      setPinCenter(center);
      setHasLasso(true);
    };
    mapClickListener.current = g.maps.event.addListener(mapInstance.current, 'click', handler);
    return () => {
      if (mapClickListener.current && g?.maps?.event) {
        g.maps.event.removeListener(mapClickListener.current);
      }
      mapClickListener.current = null;
    };
  }, [status, mode]);

  // Pin mode — render the marker + circle whenever center/radius changes.
  useEffect(() => {
    if (status !== 'ready' || !mapInstance.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    if (!g?.maps) return;
    // Tear down any prior overlays so we don't leak markers when the
    // rep clicks again (or switches back to polygon mode).
    if (pinMarker.current) {
      (pinMarker.current as { setMap: (m: unknown) => void }).setMap(null);
      pinMarker.current = null;
    }
    if (circleOverlay.current) {
      (circleOverlay.current as { setMap: (m: unknown) => void }).setMap(null);
      circleOverlay.current = null;
    }
    if (mode !== 'pin' || !pinCenter) return;
    const radiusM = pinRadiusMi * 1609.34;
    pinMarker.current = new g.maps.Marker({
      map: mapInstance.current,
      position: pinCenter,
      draggable: true,
    });
    circleOverlay.current = new g.maps.Circle({
      map: mapInstance.current,
      center: pinCenter,
      radius: radiusM,
      fillColor: '#F2903A',
      fillOpacity: 0.18,
      strokeColor: '#F2903A',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      clickable: false,
    });
    // Drag-the-pin updates the circle live.
    g.maps.event.addListener(pinMarker.current, 'dragend', (...args: unknown[]) => {
      const ev = args[0] as { latLng?: { lat: () => number; lng: () => number } };
      const ll = ev?.latLng;
      if (!ll) return;
      setPinCenter({ lat: ll.lat(), lng: ll.lng() });
    });
  }, [status, mode, pinCenter, pinRadiusMi]);

  function clearLasso() {
    // Polygon mode
    const polygon = activePolygon.current as { setMap: (m: unknown) => void } | null;
    if (polygon) polygon.setMap(null);
    activePolygon.current = null;
    // Pin mode — clear the marker + circle so the map resets cleanly.
    if (pinMarker.current) (pinMarker.current as { setMap: (m: unknown) => void }).setMap(null);
    pinMarker.current = null;
    if (circleOverlay.current)
      (circleOverlay.current as { setMap: (m: unknown) => void }).setMap(null);
    circleOverlay.current = null;
    setPinCenter(null);
    setHasLasso(false);
    setScrapeResult(null);
    setScrapeError(null);
  }

  /**
   * Vertices of the active shape — works for both polygon and pin
   * modes. Pin mode synthesizes a 32-vertex polygon approximating the
   * circle so the server's point-in-polygon dedupe keeps working
   * unchanged.
   */
  function getPolygonVertices(): Array<{ lat: number; lng: number }> | null {
    if (mode === 'pin') {
      if (!pinCenter) return null;
      return circleToPolygon(pinCenter, pinRadiusMi, 32);
    }
    const polygon = activePolygon.current as {
      getPath: () => { getArray: () => Array<{ lat: () => number; lng: () => number }> };
    } | null;
    if (!polygon) return null;
    const path = polygon.getPath().getArray();
    if (path.length < 3) return null;
    return path.map((ll) => ({ lat: ll.lat(), lng: ll.lng() }));
  }

  function toggleScrapeType(t: GooglePartnerType) {
    setScrapeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function onScrape() {
    const polygon = getPolygonVertices();
    if (!polygon) {
      setScrapeError('Draw a lasso first.');
      return;
    }
    if (scrapeTypes.size === 0) {
      setScrapeError('Pick at least one partner type to search.');
      return;
    }
    setScrapeRunning(true);
    setScrapeError(null);
    setScrapeResult(null);
    startTransition(async () => {
      try {
        const result = await scrapeLassoForLeads({
          marketId,
          polygon,
          partnerTypes: [...scrapeTypes],
        });
        setScrapeResult(result);
      } catch (err) {
        setScrapeError(err instanceof Error ? err.message : 'Scrape failed');
      } finally {
        setScrapeRunning(false);
      }
    });
  }

  return (
    <div className="grid h-full grid-rows-[1fr_auto] gap-0 lg:grid-cols-[1fr_360px] lg:grid-rows-1">
      {/* Map surface */}
      <div className="relative min-h-[300px]">
        {status === 'loading' && (
          <div className="absolute inset-0 grid place-items-center text-xs text-gray-500">
            Loading map…
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-red-700">
            Google Maps script failed to load. Check the API key + that the Maps JavaScript API is
            enabled on it.
          </div>
        )}
        <div ref={mapRef} className={`h-full w-full ${status === 'loading' ? 'hidden' : ''}`} />

        {/* Floating toolbar — mode switcher + per-mode controls */}
        {status === 'ready' && (
          <div className="absolute left-2 top-2 z-10 flex flex-col gap-1.5">
            {/* Mode switcher */}
            <div className="flex rounded-md border border-gray-200 bg-white p-0.5 text-xs shadow-sm">
              <button
                type="button"
                onClick={() => {
                  if (mode === 'polygon') return;
                  clearLasso();
                  setMode('polygon');
                  setLassoActive(false);
                }}
                className={`flex items-center gap-1 rounded px-2 py-1 transition ${
                  mode === 'polygon' ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Lasso className="h-3 w-3" /> Polygon
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mode === 'pin') return;
                  clearLasso();
                  setMode('pin');
                  setLassoActive(false);
                }}
                className={`flex items-center gap-1 rounded px-2 py-1 transition ${
                  mode === 'pin' ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <MapPin className="h-3 w-3" /> Pin + radius
              </button>
            </div>

            {mode === 'polygon' && (
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
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition ${
                  lassoActive
                    ? 'border-primary bg-primary text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary'
                }`}
              >
                <Lasso className="h-3.5 w-3.5" />
                {lassoActive ? 'Drawing… click first point to close' : 'Lasso a territory'}
              </button>
            )}

            {mode === 'pin' && (
              <div className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
                {!pinCenter ? (
                  <span className="text-gray-700">Click the map to drop a center pin</span>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10.5px] text-gray-500">
                        {pinCenter.lat.toFixed(4)}, {pinCenter.lng.toFixed(4)}
                      </span>
                      <span className="font-semibold tabular-nums text-gray-900">
                        {pinRadiusMi.toFixed(1)} mi
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={30}
                      step={0.25}
                      value={pinRadiusMi}
                      onChange={(e) => setPinRadiusMi(Number(e.target.value))}
                      className="w-44"
                    />
                  </div>
                )}
              </div>
            )}

            {hasLasso && !lassoActive && (
              <button
                type="button"
                onClick={clearLasso}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-red-300 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Side panel — scrape controls + results */}
      <aside className="overflow-y-auto border-t border-card-border bg-canvas p-4 lg:border-l lg:border-t-0 lg:p-5">
        <Card title="Find new leads in this lasso">
          {!hasLasso ? (
            <p className="text-xs text-gray-500">
              {mode === 'polygon' ? (
                <>
                  Use the <strong>Lasso a territory</strong> button on the map to draw a polygon,
                  then pick which partner types to search.
                </>
              ) : (
                <>
                  Switch to <strong>Pin + radius</strong> on the map, click anywhere to drop a
                  center pin, and drag the slider to set how many miles around it to search.
                </>
              )}
            </p>
          ) : (
            <>
              <p className="text-[11px] text-gray-500">
                Searching <strong>{marketName}</strong>. Google Places results that fall inside your
                polygon will be added to{' '}
                <Link
                  href="/admin/scraped-leads"
                  className="font-medium text-primary hover:underline"
                >
                  /admin/scraped-leads
                </Link>{' '}
                for review.
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {SCRAPE_TYPE_OPTIONS.map((opt) => {
                  const on = scrapeTypes.has(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggleScrapeType(opt.key)}
                      disabled={scrapeRunning}
                      className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                        on
                          ? 'border-primary bg-primary text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onScrape}
                  disabled={scrapeRunning || scrapeTypes.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {scrapeRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {scrapeRunning ? 'Scanning Google Places…' : 'Find new leads'}
                </button>
                {scrapeTypes.size === 0 && (
                  <Pill tone="soft" color="amber">
                    pick at least one type
                  </Pill>
                )}
              </div>
              {scrapeError && <p className="mt-3 text-[11px] text-red-600">{scrapeError}</p>}
              {scrapeResult && (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] text-emerald-900">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {scrapeResult.inserted} new lead
                      {scrapeResult.inserted === 1 ? '' : 's'} added
                    </span>
                    <Link
                      href="/admin/scraped-leads"
                      className="inline-flex items-center gap-0.5 font-medium text-emerald-800 hover:underline"
                    >
                      Review queue <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="mt-1 text-emerald-800/80">
                    {scrapeResult.fetched} fetched · {scrapeResult.insidePolygon} inside polygon ·{' '}
                    {scrapeResult.duplicates} already tracked
                    {scrapeResult.errors > 0 ? ` · ${scrapeResult.errors} errors` : ''}
                  </div>
                  {scrapeResult.perType.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {scrapeResult.perType.map((t) => {
                        const label =
                          SCRAPE_TYPE_OPTIONS.find((o) => o.key === t.partnerType)?.label ??
                          t.partnerType;
                        return (
                          <div key={t.partnerType}>
                            <div className="flex items-center justify-between">
                              <span className="truncate">{label}</span>
                              <span
                                className={`ml-2 font-mono tabular-nums ${
                                  t.error ? 'text-red-700' : ''
                                }`}
                              >
                                {t.error ? 'failed' : `+${t.inserted} / ${t.fetched}`}
                              </span>
                            </div>
                            {t.error && (
                              <div className="mt-0.5 text-[10.5px] text-red-700">{t.error}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </aside>
    </div>
  );
}

/**
 * Approximate a circle (lat/lng center + radius in miles) as a
 * polygon with N vertices. We project on a flat plane scaled by the
 * earth's radius — accurate enough for radii up to ~30 miles, which
 * is also our server-side bounding-circle cap.
 */
function circleToPolygon(
  center: { lat: number; lng: number },
  radiusMi: number,
  vertexCount: number,
): Array<{ lat: number; lng: number }> {
  const R = 3958.8; // earth radius miles
  const dRad = radiusMi / R; // angular distance
  const latRad = (center.lat * Math.PI) / 180;
  const lngRad = (center.lng * Math.PI) / 180;
  const out: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < vertexCount; i++) {
    const bearing = (i / vertexCount) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(dRad) + Math.cos(latRad) * Math.sin(dRad) * Math.cos(bearing),
    );
    const lng2 =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(dRad) * Math.cos(latRad),
        Math.cos(dRad) - Math.sin(latRad) * Math.sin(lat2),
      );
    out.push({ lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI });
  }
  return out;
}
