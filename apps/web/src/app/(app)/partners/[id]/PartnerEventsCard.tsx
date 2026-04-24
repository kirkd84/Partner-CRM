/**
 * Partner event history card for the partner detail page.
 *
 * Server-renders a compact table of every event this partner has been
 * invited to, with per-invite status + tickets. Summary chips at the
 * top surface the three reliability stats we compute in the EV-8
 * postmortem: acceptance rate, show rate, composite score.
 *
 * Empty state collapses the card entirely — no visual noise on
 * partners who've never been invited to an event.
 */

import Link from 'next/link';
import { partnerEventHistory } from '@/lib/events/analytics';
import { prisma } from '@partnerradar/db';

export async function PartnerEventsCard({ partnerId }: { partnerId: string }) {
  const [history, partner] = await Promise.all([
    partnerEventHistory(partnerId),
    prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        eventAcceptanceRate: true,
        eventShowRate: true,
        reliabilityScore: true,
      },
    }),
  ]);

  if (history.length === 0) return null;

  return (
    <div className="mt-6 rounded-md border border-card-border bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Event history</h3>
        <div className="flex items-center gap-3 text-[11px]">
          <Stat label="Acceptance" value={partner?.eventAcceptanceRate ?? null} />
          <Stat label="Show" value={partner?.eventShowRate ?? null} />
          <Stat label="Score" value={partner?.reliabilityScore ?? null} accent />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-label text-gray-500">
            <th className="px-4 py-2 font-medium">Event</th>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Tickets</th>
          </tr>
        </thead>
        <tbody>
          {history.slice(0, 15).map((h) => (
            <tr key={`${h.eventId}-${h.status}`} className="border-t border-gray-100">
              <td className="px-4 py-2">
                <Link
                  href={`/events/${h.eventId}`}
                  className="font-medium text-gray-900 hover:underline"
                >
                  {h.eventName}
                </Link>
              </td>
              <td className="px-4 py-2 text-gray-700">{formatDate(h.eventStart, h.timezone)}</td>
              <td className="px-4 py-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor(
                    h.status,
                  )}`}
                >
                  {h.status}
                </span>
              </td>
              <td className="px-4 py-2 text-[12px] text-gray-600">
                {h.tickets.map((t) => `${t.name}${t.checkedIn ? ' ✓' : ''}`).join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {history.length > 15 ? (
        <p className="px-4 py-2 text-[11px] text-gray-500">
          Showing 15 most recent of {history.length}.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | null; accent?: boolean }) {
  const formatted =
    value == null
      ? '—'
      : label === 'Score'
        ? (value * 100).toFixed(0)
        : `${(value * 100).toFixed(0)}%`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5">
      <span className="text-gray-500">{label}</span>
      <span
        className={`font-semibold tabular-nums ${accent ? 'text-indigo-700' : 'text-gray-900'}`}
      >
        {formatted}
      </span>
    </span>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case 'CONFIRMED':
      return 'bg-indigo-50 text-indigo-700';
    case 'ACCEPTED':
    case 'CONFIRMATION_REQUESTED':
      return 'bg-emerald-50 text-emerald-700';
    case 'DECLINED':
      return 'bg-gray-100 text-gray-600';
    case 'NO_SHOW':
      return 'bg-amber-50 text-amber-700';
    case 'AUTO_CANCELED':
    case 'EXPIRED':
      return 'bg-red-50 text-red-600';
    default:
      return 'bg-gray-100 text-gray-600';
  }
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
