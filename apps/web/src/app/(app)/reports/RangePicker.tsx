'use client';

/**
 * URL-driven date range picker — every tab shares the same set of
 * windows and the same `range` query param. Pure helpers (rangeToStart,
 * rangeLabel, RangeId) live in ./range.ts so server components can
 * import them without crossing the client boundary.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { RANGES, type RangeId } from './range';

export type { RangeId };

export function RangePicker({ current }: { current: RangeId }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="flex items-center gap-1 rounded-md border border-card-border bg-white p-0.5 text-xs">
      {RANGES.map((r) => {
        const active = r.id === current;
        const nextParams = new URLSearchParams(params?.toString());
        nextParams.set('range', r.id);
        const href = `${pathname}?${nextParams.toString()}`;
        return (
          <Link
            key={r.id}
            href={href}
            className={`rounded px-2.5 py-1 transition ${
              active ? 'bg-primary/10 font-semibold text-primary' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}
