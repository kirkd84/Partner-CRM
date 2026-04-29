/**
 * Pure (non-client) helpers shared by the /reports page server
 * components and the RangePicker client component.
 *
 * These were previously colocated in RangePicker.tsx, but that file
 * carries `'use client'` — and Next 15 enforces that a server file
 * can't import functions from a client module (the function would
 * have to ship over the RSC boundary). Moving them here lets both
 * sides import freely.
 */
export const RANGES = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'ytd', label: 'YTD' },
] as const;

export type RangeId = (typeof RANGES)[number]['id'];

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
