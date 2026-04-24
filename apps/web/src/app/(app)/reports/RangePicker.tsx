'use client';

/**
 * URL-driven date range picker — every tab shares the same set of
 * windows and the same `range` query param.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const RANGES = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'ytd', label: 'YTD' },
] as const;

export type RangeId = (typeof RANGES)[number]['id'];

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

export function rangeToStart(range: RangeId): Date {
  const now = new Date();
  switch (range) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1);
  }
}

export function rangeLabel(range: RangeId): string {
  return RANGES.find((r) => r.id === range)?.label ?? range;
}
