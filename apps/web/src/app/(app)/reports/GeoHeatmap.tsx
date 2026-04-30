'use client';

/**
 * Leaflet + leaflet.heat heatmap of partner density.
 *
 * Loads Leaflet from CDN at runtime (matches the pattern in /map's
 * MapView). The "Activated only" toggle filters to ACTIVATED partners;
 * "Recent (90d)" boosts the weight of recently-activated partners so
 * fresh momentum shows up brighter than stale wins.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

interface HeatPoint {
  id: string;
  lat: number;
  lng: number;
  stage: string;
  activatedAt: string | null;
  partnerType: string;
}

interface Props {
  points: HeatPoint[];
  center: { lat: number; lng: number };
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

declare global {
  interface Window {
    L?: unknown;
  }
}

export function GeoHeatmap({ points, center }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const layerRef = useRef<unknown>(null);
  const [activatedOnly, setActivatedOnly] = useState(false);
  const [recentBoost, setRecentBoost] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let pool = points;
    if (activatedOnly) pool = pool.filter((p) => p.stage === 'ACTIVATED');
    return pool;
  }, [points, activatedOnly]);

  // Build [lat, lng, intensity] tuples. Intensity defaults to 0.5;
  // ACTIVATED gets full weight; recent activation in recent-boost mode
  // doubles down to make heat clusters visible.
  const heatData = useMemo(() => {
    const cutoff = Date.now() - NINETY_DAYS_MS;
    return filtered.map((p) => {
      let weight = 0.5;
      if (p.stage === 'ACTIVATED') weight = 1.0;
      if (p.stage === 'IN_CONVERSATION' || p.stage === 'PROPOSAL_SENT') weight = 0.75;
      if (recentBoost && p.activatedAt) {
        const t = new Date(p.activatedAt).getTime();
        if (t >= cutoff) weight = Math.min(weight + 0.6, 1.6);
      }
      return [p.lat, p.lng, weight] as [number, number, number];
    });
  }, [filtered, recentBoost]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await ensureLeafletLoaded();
        if (cancelled || !ref.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).L;
        if (!mapRef.current) {
          const map = L.map(ref.current, {
            center: [center.lat, center.lng],
            zoom: 9,
            zoomControl: true,
          });
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
            attribution:
              '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 19,
          }).addTo(map);
          mapRef.current = map;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = mapRef.current as any;
        if (layerRef.current) {
          map.removeLayer(layerRef.current);
        }
        layerRef.current = L.heatLayer(heatData, {
          radius: 28,
          blur: 22,
          maxZoom: 17,
          minOpacity: 0.35,
          gradient: {
            0.2: '#3b82f6',
            0.45: '#a855f7',
            0.7: '#f97316',
            0.9: '#ef4444',
          },
        }).addTo(map);
      } catch (err) {
        console.warn('[GeoHeatmap] init failed', err);
        if (!cancelled) setError('Map failed to load');
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [heatData, center.lat, center.lng]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-[11px] text-gray-600">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={activatedOnly}
            onChange={(e) => setActivatedOnly(e.target.checked)}
          />
          Activated only
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={recentBoost}
            onChange={(e) => setRecentBoost(e.target.checked)}
          />
          Boost last 90 days
        </label>
        <span className="ml-auto tabular-nums text-gray-500">{filtered.length} partners</span>
      </div>
      <div
        ref={ref}
        className="h-[480px] w-full overflow-hidden rounded border border-gray-200 bg-gray-100"
      />
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

async function ensureLeafletLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.L && w.L.heatLayer) return;
  // Inject leaflet css.
  if (!document.querySelector('link[data-leaflet]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.dataset.leaflet = '1';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
  }
  if (!w.L) {
    await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
  }
  if (!w.L.heatLayer) {
    await loadScript('https://cdn.jsdelivr.net/npm/leaflet.heat@0.2.0/dist/leaflet-heat.js');
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`load failed: ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => {
      s.dataset.loaded = '1';
      resolve();
    };
    s.onerror = () => reject(new Error(`load failed: ${src}`));
    document.head.appendChild(s);
  });
}
