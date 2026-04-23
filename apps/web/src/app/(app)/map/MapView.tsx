'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, Pill } from '@partnerradar/ui';
import {
  PARTNER_TYPE_LABELS,
  STAGE_COLORS,
  STAGE_LABELS,
  type PartnerStage,
  type PartnerType,
} from '@partnerradar/types';
import { AlertTriangle, ExternalLink } from 'lucide-react';

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
}: {
  apiKey: string;
  defaultCenter: { lat: number; lng: number };
  partners: MapPartner[];
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<MapPartner | null>(null);

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=drawing,places&loading=async`;
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
    if (!google?.maps) {
      setStatus('error');
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    const map = new google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

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

  if (status === 'error') {
    return (
      <Card>
        <div className="flex items-start gap-3 py-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div className="text-sm">
            <div className="font-semibold text-gray-900">Could not load Google Maps</div>
            <div className="text-xs text-gray-600">
              The key is present but the script failed to load. Check billing, referrer restrictions, and that the Maps JS API is enabled.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
      <div className="h-[600px] overflow-hidden rounded-lg border border-card-border bg-white shadow-card">
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Loading map…
          </div>
        )}
        <div ref={mapRef} className={`h-full w-full ${status === 'loading' ? 'hidden' : ''}`} />
      </div>
      <aside className="flex flex-col">
        {selected ? (
          <Card title={selected.companyName}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-gray-400">{selected.publicId}</span>
                <Pill tone="soft" color={STAGE_COLORS[selected.stage]}>
                  {STAGE_LABELS[selected.stage]}
                </Pill>
              </div>
              <div className="text-xs text-gray-600">{PARTNER_TYPE_LABELS[selected.partnerType]}</div>
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
              Partner details show up here. Pin color = stage: grey NEW_LEAD, blue CONTACTED, violet MEETING_SET, yellow PROPOSAL, emerald ACTIVATED, orange DORMANT, red DO_NOT_CONTACT.
            </p>
          </Card>
        )}
      </aside>
    </div>
  );
}
