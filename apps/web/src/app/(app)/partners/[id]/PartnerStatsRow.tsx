import { Card } from '@partnerradar/ui';
import { DollarSign, Briefcase } from 'lucide-react';
import type { PartnerStats } from '@partnerradar/integrations';

/**
 * Revenue + project count across MTD / YTD / Last Year / Lifetime.
 * Styled to match the Radar 30-day stat cards (color-chipped icon on
 * the left, stacked metric + label on the right). Server component —
 * data is read from Storm's mock and passed in.
 */
export function PartnerStatsRow({ stats }: { stats: PartnerStats | null }) {
  if (!stats) {
    return (
      <Card title="Partner performance">
        <p className="text-sm text-gray-500">
          Activate this partner to see revenue + project stats from Storm Cloud.
        </p>
      </Card>
    );
  }

  const windows: Array<{ label: string; key: keyof PartnerStats }> = [
    { label: 'Month to date', key: 'mtd' },
    { label: 'Year to date', key: 'ytd' },
    { label: 'Last year', key: 'lastYear' },
    { label: 'Lifetime', key: 'lifetime' },
  ];

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-gray-500" />
          Partner performance
          <span className="text-[10.5px] uppercase tracking-label text-gray-400">
            from Storm Cloud
          </span>
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {windows.map(({ label, key }) => {
          const { revenue, projects } = stats[key];
          return (
            <div
              key={key}
              className="flex items-start gap-3 rounded-lg border border-card-border bg-white p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
                <DollarSign className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-medium uppercase tracking-label text-gray-500">
                  {label}
                </div>
                <div className="truncate text-xl font-semibold tracking-tight text-gray-900">
                  {formatCurrency(revenue)}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                  <Briefcase className="h-3 w-3" />
                  {projects} project{projects === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function formatCurrency(n: number): string {
  // Show the full number — Kirk wants "$176,240" not "$176k". Commas
  // come from the locale; no trailing decimals for these big stats so
  // the column stays narrow.
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
