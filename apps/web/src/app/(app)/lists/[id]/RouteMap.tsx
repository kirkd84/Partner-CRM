'use client';

/**
 * Leaflet route map for a single hit-list day.
 *
 * Renders the start address as a green pin and each stop as a numbered
 * blue (or green-when-completed) circle. Connects them in order with
 * a polyline. Auto-fits bounds to all markers.
 *
 * Loads Leaflet from CDN at runtime — same pattern as the geo heatmap
 * and /map. We don't use any heavy plugins; just the base library plus
 * divIcon for the numbered markers.
 */

import { useEffect, useRef, useState } from 'react';

interface MapStop {
  id: string;
  order: number;
  lat: number;
  lng: number;
  label: string;
  completed: boolean;
}

interface Props {
  start: { lat: number; lng: number; label: string };
  stops: MapStop[];
}

declare global {
  interface Window {
    L?: unknown;
  }
}

export function RouteMap({ start, stops }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const layerRef = useRef<unknown>(null);
  const [error, setError] = useState<string | null>(null);

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
            zoomControl: true,
            scrollWheelZoom: false,
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (layerRef.current as any).remove();
          layerRef.current = null;
        }
        const group = L.layerGroup();
        // Start marker — green pin with a "Start" label.
        const startIcon = L.divIcon({
          className: 'route-start-marker',
          html: `<div style="background:#10b981;color:#fff;font-weight:700;font-size:10px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);">S</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([start.lat, start.lng], { icon: startIcon })
          .bindTooltip(`Start: ${start.label}`)
          .addTo(group);

        // Numbered stop markers.
        for (const s of stops) {
          const color = s.completed ? '#10b981' : '#3b82f6';
          const stopIcon = L.divIcon({
            className: 'route-stop-marker',
            html: `<div style="background:${color};color:#fff;font-weight:700;font-size:11px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);">${s.order}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });
          L.marker([s.lat, s.lng], { icon: stopIcon })
            .bindTooltip(`${s.order}. ${s.label}`)
            .addTo(group);
        }
        // Polyline connecting start → stops in order.
        const path: Array<[number, number]> = [
          [start.lat, start.lng],
          ...stops.map((s) => [s.lat, s.lng] as [number, number]),
        ];
        L.polyline(path, {
          color: '#3b82f6',
          weight: 3,
          opacity: 0.7,
          dashArray: '6,4',
        }).addTo(group);

        group.addTo(map);
        layerRef.current = group;
        // Fit bounds to start + every stop.
        const bounds = L.latLngBounds([
          [start.lat, start.lng],
          ...stops.map((s) => [s.lat, s.lng]),
        ]);
        map.fitBounds(bounds.pad(0.15));
      } catch (err) {
        console.warn('[RouteMap] init failed', err);
        if (!cancelled) setError('Map failed to load');
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [start.lat, start.lng, start.label, stops]);

  return (
    <div>
      <div
        ref={ref}
        className="h-[320px] w-full overflow-hidden rounded-lg border border-card-border bg-gray-100"
      />
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

async function ensureLeafletLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.L) return;
  if (!document.querySelector('link[data-leaflet]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.dataset.leaflet = '1';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
  }
  await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
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
