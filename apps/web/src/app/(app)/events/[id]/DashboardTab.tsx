/**
 * Event dashboard tab — server-rendered funnel + message stats +
 * cost breakdown + ticket utilization. Manager+ only (enforced by
 * the parent page; this component trusts whatever it's handed).
 *
 * Live charts are simple inline SVG so we don't pull Recharts or d3
 * into the event detail bundle. The numbers are the story; the
 * chart is just to make scanning them faster.
 */

import type { EventAnalytics } from '@/lib/events/analytics';
import Link from 'next/link';

interface Props {
  eventId: string;
  analytics: EventAnalytics;
}

export function DashboardTab({ eventId, analytics }: Props) {
  const { funnel, responseBuckets, messagePerformance, cost, ticketUtilization } = analytics;
  const funnelMax = Math.max(1, funnel.invited, funnel.accepted, funnel.confirmed, funnel.attended);
  const responseMax = Math.max(1, ...responseBuckets.map((b) => b.count));

  return (
    <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
      <section className="col-span-1 md:col-span-2">
        <SectionHeader
          title="Funnel"
          action={
            <Link
              href={`/api/events/${eventId}/export?view=funnel`}
              className="text-[11px] font-semibold text-indigo-700 hover:underline"
            >
              CSV
            </Link>
          }
        />
        <div className="mt-3 grid grid-cols-4 gap-3">
          {[
            { label: 'Invited', value: funnel.invited },
            { label: 'Accepted', value: funnel.accepted },
            { label: 'Confirmed', value: funnel.confirmed },
            { label: 'Attended', value: funnel.attended },
          ].map((step, i, arr) => {
            const prev = i > 0 ? arr[i - 1].value : null;
            const conv = prev && prev > 0 ? (step.value / prev) * 100 : null;
            return (
              <div key={step.label} className="rounded-md border border-card-border bg-white p-4">
                <p className="text-[11px] uppercase tracking-label text-gray-500">{step.label}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-900">
                  {step.value}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${(step.value / funnelMax) * 100}%` }}
                  />
                </div>
                {conv != null ? (
                  <p className="mt-1 text-[11px] text-gray-500">{conv.toFixed(0)}% of prior</p>
                ) : (
                  <p className="mt-1 text-[11px] text-gray-400">—</p>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3">
          <Mini label="No-show" value={funnel.noShow} />
          <Mini label="Declined" value={funnel.declined} />
          <Mini label="Expired" value={funnel.expired} />
          <Mini label="Auto-canceled" value={funnel.autoCanceled} />
        </div>
      </section>

      <section>
        <SectionHeader title="Response time" />
        <div className="mt-3 rounded-md border border-card-border bg-white p-4">
          <ul className="space-y-2">
            {responseBuckets.map((b) => (
              <li key={b.label} className="flex items-center gap-3 text-xs">
                <span className="w-12 tabular-nums text-gray-500">{b.label}</span>
                <span className="flex-1 overflow-hidden rounded-full bg-gray-100">
                  <span
                    className="block h-3 rounded-full bg-emerald-500"
                    style={{ width: `${(b.count / responseMax) * 100}%` }}
                  />
                </span>
                <span className="w-10 text-right font-semibold tabular-nums text-gray-900">
                  {b.count}
                </span>
              </li>
            ))}
          </ul>
          {responseBuckets.every((b) => b.count === 0) ? (
            <p className="mt-2 text-center text-[11px] text-gray-400">No responses logged yet.</p>
          ) : null}
        </div>
      </section>

      <section>
        <SectionHeader title="Message performance" />
        <div className="mt-3 rounded-md border border-card-border bg-white p-4">
          {messagePerformance.length === 0 ? (
            <p className="text-center text-[11px] text-gray-400">No reminders sent.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-label text-gray-500">
                  <th className="py-1 font-medium">Kind</th>
                  <th className="py-1 text-right font-medium">Sched.</th>
                  <th className="py-1 text-right font-medium">Sent</th>
                  <th className="py-1 text-right font-medium">Canceled</th>
                  <th className="py-1 text-right font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {messagePerformance.map((m) => (
                  <tr key={m.kind} className="border-t border-gray-100">
                    <td className="py-1 font-medium text-gray-900">{m.kind}</td>
                    <td className="py-1 text-right tabular-nums">{m.scheduled}</td>
                    <td className="py-1 text-right tabular-nums text-emerald-700">{m.sent}</td>
                    <td className="py-1 text-right tabular-nums text-gray-500">{m.canceled}</td>
                    <td className="py-1 text-right tabular-nums text-red-600">{m.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <SectionHeader title="Cost (estimate)" />
        <div className="mt-3 rounded-md border border-card-border bg-white p-4">
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between">
              <span className="text-gray-600">SMS</span>
              <span className="font-semibold tabular-nums text-gray-900">
                ${cost.estSmsCost.toFixed(2)}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-gray-600">Email</span>
              <span className="font-semibold tabular-nums text-gray-900">
                ${cost.estEmailCost.toFixed(2)}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-gray-600">Staff time</span>
              <span className="font-semibold tabular-nums text-gray-900">{cost.estStaffTime}h</span>
            </li>
            <li className="mt-2 flex justify-between border-t border-gray-100 pt-2 font-semibold">
              <span className="text-gray-900">Total comms</span>
              <span className="tabular-nums text-gray-900">
                ${(cost.estSmsCost + cost.estEmailCost).toFixed(2)}
              </span>
            </li>
          </ul>
          <p className="mt-2 text-[11px] text-gray-400">
            Rough — real Twilio/Resend billing plugs in when live creds land.
          </p>
        </div>
      </section>

      <section className="col-span-1 md:col-span-2">
        <SectionHeader title="Ticket utilization" />
        <div className="mt-3 overflow-hidden rounded-md border border-card-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-label text-gray-500">
                <th className="px-4 py-2 font-medium">Ticket</th>
                <th className="px-4 py-2 text-right font-medium">Confirmed</th>
                <th className="px-4 py-2 text-right font-medium">Capacity</th>
                <th className="px-4 py-2 text-right font-medium">Checked-in</th>
                <th className="px-4 py-2 text-right font-medium">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {ticketUtilization.map((tt) => (
                <tr key={tt.ticketTypeId} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-900">{tt.ticketName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{tt.confirmed}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500">{tt.capacity}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-700">
                    {tt.checkedIn}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {(tt.utilization * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
              {ticketUtilization.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-[11px] text-gray-400">
                    No ticket types yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-label text-gray-500">{title}</h2>
      {action ?? null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-card-border bg-white p-3">
      <p className="text-[10px] uppercase tracking-label text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
