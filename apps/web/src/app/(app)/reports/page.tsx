/**
 * /reports — manager+ dashboards.
 *
 * Four tabs:
 *   • Activity — rep-initiated actions, daily volume, top reps
 *   • Funnel   — stage distribution + reach rates with conversion %
 *   • ROI      — revenue ÷ spend per rep (Storm + Expenses)
 *   • Expenses — spend by category / rep / approval status
 *
 * Tab selection + range window are URL-driven (?tab, ?range) so every
 * view is bookmarkable. Manager+ gate is enforced here; REP users are
 * bounced to /radar.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ReportsTabs, type ReportTab } from './ReportsTabs';
import { RangePicker } from './RangePicker';
import { rangeLabel, type RangeId } from './range';
import { ActivityTab } from './ActivityTab';
import { FunnelTab } from './FunnelTab';
import { RoiTab } from './RoiTab';
import { ExpensesTab } from './ExpensesTab';
import { GeoTab } from './GeoTab';

export const dynamic = 'force-dynamic';

const ALLOWED_TABS: ReportTab[] = ['activity', 'funnel', 'roi', 'expenses', 'geo'];
const ALLOWED_RANGES: RangeId[] = ['7d', '30d', '90d', 'ytd'];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/radar');

  const sp = await searchParams;
  const tab = (ALLOWED_TABS as string[]).includes(sp.tab ?? '')
    ? (sp.tab as ReportTab)
    : 'activity';
  const range = (ALLOWED_RANGES as string[]).includes(sp.range ?? '')
    ? (sp.range as RangeId)
    : '30d';

  // Admins see every market; managers see only theirs. We pass the
  // market list in so each tab can build its own Prisma query without
  // duplicating the scope check.
  const markets = session.user.markets ?? [];
  const scopeAllMarkets = session.user.role === 'ADMIN';

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
            <p className="text-xs text-gray-500">
              {rangeLabel(range)} ·{' '}
              {scopeAllMarkets ? 'All markets (admin)' : `Your markets (${markets.length})`}
            </p>
          </div>
          <RangePicker current={range} />
        </div>
      </header>

      <ReportsTabs current={tab} />

      <div className="flex-1 overflow-auto bg-canvas">
        {tab === 'activity' && (
          <ActivityTab range={range} markets={markets} scopeAllMarkets={scopeAllMarkets} />
        )}
        {tab === 'funnel' && (
          <FunnelTab range={range} markets={markets} scopeAllMarkets={scopeAllMarkets} />
        )}
        {tab === 'roi' && (
          <RoiTab range={range} markets={markets} scopeAllMarkets={scopeAllMarkets} />
        )}
        {tab === 'expenses' && (
          <ExpensesTab range={range} markets={markets} scopeAllMarkets={scopeAllMarkets} />
        )}
        {tab === 'geo' && <GeoTab markets={markets} scopeAllMarkets={scopeAllMarkets} />}
      </div>
    </div>
  );
}
