/**
 * Past-events table rendered on /events?tab=past.
 *
 * For each past event we show invited/confirmed/attended counts plus
 * an ROI ratio computed from 90-day post-event RevenueAttribution on
 * any attended Partner.
 *
 * ROI math is deliberately simple: ratio = revenue / (smsCost +
 * emailCost). We don't amortize staff time yet because we don't track
 * per-event hours — when the Cost report gains an hours input in
 * EV-11 polish, we'll fold it in.
 */

import Link from 'next/link';
import { Pill } from '@partnerradar/ui';

export interface PastEventRow {
  id: string;
  publicId: string;
  name: string;
  startsAt: string;
  timezone: string;
  marketName: string;
  status: string;
  invited: number;
  confirmed: number;
  attended: number;
  cost: number;
  revenue: number;
}

export function PastEventsTable({ rows }: { rows: PastEventRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-card-border bg-white p-10 text-center text-sm text-gray-500">
        No past events yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-card-border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-label text-gray-500">
            <th className="px-4 py-2 font-medium">Event</th>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 text-right font-medium">Invited</th>
            <th className="px-4 py-2 text-right font-medium">Confirmed</th>
            <th className="px-4 py-2 text-right font-medium">Attended</th>
            <th className="px-4 py-2 text-right font-medium">Cost</th>
            <th className="px-4 py-2 text-right font-medium">Revenue (90d)</th>
            <th className="px-4 py-2 text-right font-medium">ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const roi = r.cost > 0 ? r.revenue / r.cost : null;
            return (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/events/${r.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {r.name}
                  </Link>
                  <span className="ml-2 font-mono text-[10px] text-gray-400">{r.publicId}</span>
                  <div className="text-[11px] text-gray-500">{r.marketName}</div>
                </td>
                <td className="px-4 py-2 text-gray-700">{formatDate(r.startsAt, r.timezone)}</td>
                <td className="px-4 py-2">
                  <Pill color={statusColor(r.status)} tone="soft">
                    {r.status}
                  </Pill>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.invited}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.confirmed}</td>
                <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{r.attended}</td>
                <td className="px-4 py-2 text-right tabular-nums">${r.cost.toFixed(2)}</td>
                <td className="px-4 py-2 text-right tabular-nums">${r.revenue.toFixed(0)}</td>
                <td
                  className={`px-4 py-2 text-right font-semibold tabular-nums ${
                    roi == null ? 'text-gray-400' : roi >= 1 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {roi == null ? '—' : `${roi.toFixed(1)}x`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

function statusColor(s: string): string {
  switch (s) {
    case 'COMPLETED':
      return '#6366f1';
    case 'CANCELED':
      return '#ef4444';
    case 'LIVE':
      return '#10b981';
    default:
      return '#9ca3af';
  }
}
