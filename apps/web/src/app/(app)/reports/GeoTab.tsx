/**
 * Geo tab — partner-density heatmap over the active markets.
 *
 * Server component pulls the lat/lng of every (non-archived) partner
 * in scope plus their stage; the GeoHeatmap client island renders a
 * Leaflet map + leaflet.heat overlay with a toggle for "all" vs
 * "activated only". A second toggle weights by recency so the manager
 * can see where activity is heating up vs cooling off.
 */

import { prisma, Prisma } from '@partnerradar/db';
import { Card } from '@partnerradar/ui';
import { GeoHeatmap } from './GeoHeatmap';

interface Props {
  markets: string[];
  scopeAllMarkets: boolean;
}

export async function GeoTab({ markets, scopeAllMarkets }: Props) {
  const partnerScope: Prisma.PartnerWhereInput = scopeAllMarkets
    ? { archivedAt: null, lat: { not: null }, lng: { not: null } }
    : { archivedAt: null, marketId: { in: markets }, lat: { not: null }, lng: { not: null } };

  const partners = await prisma.partner.findMany({
    where: partnerScope,
    select: {
      id: true,
      lat: true,
      lng: true,
      stage: true,
      stageChangedAt: true,
      activatedAt: true,
      partnerType: true,
    },
    take: 5000, // generous cap; heatmap weights overlap so 5k is fine.
  });

  // Center: arithmetic mean of partners we have. Fallback to a CO
  // central point so empty datasets don't render an ocean view.
  const center =
    partners.length > 0
      ? (() => {
          let sumLat = 0;
          let sumLng = 0;
          let n = 0;
          for (const p of partners) {
            if (p.lat == null || p.lng == null) continue;
            sumLat += p.lat;
            sumLng += p.lng;
            n++;
          }
          return n > 0 ? { lat: sumLat / n, lng: sumLng / n } : { lat: 39.5501, lng: -105.7821 };
        })()
      : { lat: 39.5501, lng: -105.7821 };

  // Active-vs-total per market gives the manager a quick read on
  // conversion across territories. Aggregated server-side so the
  // client doesn't need to count.
  const byStage = new Map<string, number>();
  for (const p of partners) byStage.set(p.stage, (byStage.get(p.stage) ?? 0) + 1);
  const total = partners.length;
  const activated = byStage.get('ACTIVATED') ?? 0;
  const inConv = byStage.get('IN_CONVERSATION') ?? 0;
  const initial = byStage.get('INITIAL_CONTACT') ?? 0;

  const points = partners.map((p) => ({
    id: p.id,
    lat: p.lat!,
    lng: p.lng!,
    stage: p.stage,
    activatedAt: p.activatedAt?.toISOString() ?? null,
    partnerType: p.partnerType,
  }));

  return (
    <div className="p-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card title="Partner density">
          {points.length === 0 ? (
            <p className="text-xs text-gray-500">
              No partners with coordinates yet. Heatmap will appear after partners are scraped,
              imported, or geocoded.
            </p>
          ) : (
            <GeoHeatmap points={points} center={center} />
          )}
        </Card>
        <div className="space-y-3">
          <Card title="Coverage">
            <dl className="space-y-2 text-sm">
              <Row label="Total partners" value={total} />
              <Row label="Activated" value={activated} accent="emerald" />
              <Row label="In conversation" value={inConv} accent="blue" />
              <Row label="Initial contact" value={initial} accent="violet" />
              <Row
                label="Activation rate"
                value={total > 0 ? `${Math.round((activated / total) * 100)}%` : '—'}
                accent="emerald"
              />
            </dl>
          </Card>
          <Card title="How to read this">
            <p className="text-[11px] leading-relaxed text-gray-600">
              Red = high partner density. Toggle to <em>Activated only</em> to see where
              partnerships actually closed; <em>Recently active</em> weights toward partners
              activated in the last 90 days so you can spot momentum vs. coverage. Click a hot spot
              to zoom; the underlying lat/lng comes from address geocoding done at scrape / import
              time.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: 'emerald' | 'blue' | 'violet';
}) {
  const tone =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'blue'
        ? 'text-blue-700'
        : accent === 'violet'
          ? 'text-violet-700'
          : 'text-gray-900';
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}
