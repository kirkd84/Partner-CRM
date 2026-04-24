'use client';

/**
 * Partner reliability table client.
 *
 * Columns: checkbox, name, market, stage, acceptance%, show%, score,
 * auto-waitlist toggle, priority.
 *
 * Bulk actions: flip autoWaitlistEligible true/false across selected
 * rows. Only shown to admins via the `canBulkEdit` flag.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { bulkSetAutoWaitlist } from './reliability-actions';

interface Row {
  id: string;
  companyName: string;
  marketName: string;
  marketId: string;
  stage: string;
  autoWaitlistEligible: boolean;
  waitlistPriority: number | null;
  acceptanceRate: number | null;
  showRate: number | null;
  reliabilityScore: number | null;
}

export function ReliabilityClient({
  rows: initial,
  canBulkEdit,
}: {
  rows: Row[];
  canBulkEdit: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAll(visible: Row[]) {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map((r) => r.id)));
  }

  function flip(eligible: boolean) {
    if (selected.size === 0) return;
    const ids = [...selected];
    startTransition(async () => {
      const res = await bulkSetAutoWaitlist({ partnerIds: ids, eligible });
      if (!res.ok) return;
      setRows((prev) =>
        prev.map((r) => (ids.includes(r.id) ? { ...r, autoWaitlistEligible: eligible } : r)),
      );
      setSelected(new Set());
    });
  }

  return (
    <div className="flex-1 overflow-auto bg-canvas p-6">
      {canBulkEdit && selected.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs">
          <span className="font-semibold text-indigo-900">{selected.size} selected</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => flip(true)}
            className="rounded-md bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            Flag auto-waitlist eligible
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => flip(false)}
            className="rounded-md border border-indigo-200 bg-white px-3 py-1 font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-60"
          >
            Clear eligibility
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-card-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-label text-gray-500">
              {canBulkEdit && (
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.size === rows.length && rows.length > 0}
                    onChange={() => selectAll(rows)}
                    aria-label="Select all"
                  />
                </th>
              )}
              <th className="px-4 py-2 font-medium">Partner</th>
              <th className="px-4 py-2 font-medium">Market</th>
              <th className="px-4 py-2 font-medium">Stage</th>
              <th className="px-4 py-2 text-right font-medium">Acceptance</th>
              <th className="px-4 py-2 text-right font-medium">Show</th>
              <th className="px-4 py-2 text-right font-medium">Score</th>
              <th className="px-4 py-2 text-center font-medium">Auto-waitlist</th>
              <th className="px-4 py-2 text-right font-medium">Priority</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                {canBulkEdit && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label={`Select ${r.companyName}`}
                    />
                  </td>
                )}
                <td className="px-4 py-2">
                  <Link
                    href={`/partners/${r.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {r.companyName}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-700">{r.marketName}</td>
                <td className="px-4 py-2 text-[12px] text-gray-600">{r.stage}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.acceptanceRate == null ? '—' : `${(r.acceptanceRate * 100).toFixed(0)}%`}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.showRate == null ? '—' : `${(r.showRate * 100).toFixed(0)}%`}
                </td>
                <td
                  className={`px-4 py-2 text-right font-semibold tabular-nums ${scoreColor(
                    r.reliabilityScore,
                  )}`}
                >
                  {r.reliabilityScore == null ? '—' : (r.reliabilityScore * 100).toFixed(0)}
                </td>
                <td className="px-4 py-2 text-center">
                  {r.autoWaitlistEligible ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Yes
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                      No
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                  {r.waitlistPriority ?? '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={canBulkEdit ? 9 : 8}
                  className="px-4 py-6 text-center text-[11px] text-gray-400"
                >
                  No partners match the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-gray-400';
  if (score >= 0.8) return 'text-emerald-700';
  if (score >= 0.6) return 'text-amber-700';
  return 'text-red-600';
}
