/**
 * ROI leaderboard — revenue attributed ÷ expenses spent, per rep.
 *
 * Revenue comes from RevenueAttribution (Storm sync, 6-hour cron).
 * Spend comes from Expense (non-REJECTED) in the window. ROI is
 * revenue/spend when spend > 0, else ∞ for display purposes.
 */

import { prisma, Prisma } from '@partnerradar/db';
import { Card, Avatar } from '@partnerradar/ui';
import { rangeToStart, type RangeId } from './RangePicker';

interface Props {
  range: RangeId;
  markets: string[];
  scopeAllMarkets: boolean;
}

export async function RoiTab({ range, markets, scopeAllMarkets }: Props) {
  const since = rangeToStart(range);
  const partnerScope: Prisma.PartnerWhereInput = scopeAllMarkets
    ? { archivedAt: null }
    : { archivedAt: null, marketId: { in: markets } };

  // Revenue per rep = sum(RevenueAttribution.amount) for partners
  // activated BY that rep. Fallback to assignedRepId when activatedBy
  // is null (legacy rows).
  const [revenueRows, expenseRows, reps, totals] = await Promise.all([
    prisma.$queryRaw<Array<{ repId: string | null; revenue: number }>>`
      SELECT COALESCE(p."activatedBy", p."assignedRepId") AS "repId",
             COALESCE(SUM(ra.amount)::numeric, 0)::float AS revenue
      FROM "RevenueAttribution" ra
      INNER JOIN "Partner" p ON p.id = ra."partnerId"
      WHERE ra."earnedOn" >= ${since}
        AND p."archivedAt" IS NULL
        ${scopeAllMarkets ? Prisma.sql`` : Prisma.sql`AND p."marketId" = ANY(${markets})`}
      GROUP BY COALESCE(p."activatedBy", p."assignedRepId")
    `.catch(() => [] as Array<{ repId: string | null; revenue: number }>),
    prisma.expense.groupBy({
      by: ['userId'],
      where: {
        occurredOn: { gte: since },
        approvalStatus: { not: 'REJECTED' },
        partner: partnerScope,
      },
      _sum: { amount: true },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, avatarColor: true, role: true },
    }),
    prisma.$queryRaw<Array<{ revenue: number; spend: number }>>`
      SELECT
        COALESCE((SELECT SUM(ra.amount)::numeric FROM "RevenueAttribution" ra
                  INNER JOIN "Partner" p ON p.id = ra."partnerId"
                  WHERE ra."earnedOn" >= ${since}
                    AND p."archivedAt" IS NULL
                    ${scopeAllMarkets ? Prisma.sql`` : Prisma.sql`AND p."marketId" = ANY(${markets})`}
                 ), 0)::float AS revenue,
        COALESCE((SELECT SUM(e.amount)::numeric FROM "Expense" e
                  INNER JOIN "Partner" p ON p.id = e."partnerId"
                  WHERE e."occurredOn" >= ${since}
                    AND e."approvalStatus" != 'REJECTED'
                    AND p."archivedAt" IS NULL
                    ${scopeAllMarkets ? Prisma.sql`` : Prisma.sql`AND p."marketId" = ANY(${markets})`}
                 ), 0)::float AS spend
    `.catch(() => [{ revenue: 0, spend: 0 }]),
  ]);

  const repById = new Map(reps.map((r) => [r.id, r]));
  const revenueByRep = new Map<string, number>();
  for (const r of revenueRows) {
    if (r.repId) revenueByRep.set(r.repId, Number(r.revenue) || 0);
  }
  const spendByRep = new Map<string, number>();
  for (const r of expenseRows) {
    spendByRep.set(r.userId, Number(r._sum.amount ?? 0));
  }

  // Every rep that appears on either side of the equation.
  const repIds = new Set<string>([...revenueByRep.keys(), ...spendByRep.keys()]);
  const rows = Array.from(repIds)
    .map((id) => ({
      user: repById.get(id),
      revenue: revenueByRep.get(id) ?? 0,
      spend: spendByRep.get(id) ?? 0,
    }))
    .filter((r) => r.user)
    .map((r) => ({
      ...r,
      roi: r.spend > 0 ? r.revenue / r.spend : r.revenue > 0 ? Number.POSITIVE_INFINITY : 0,
    }))
    .sort((a, b) => {
      // Infinity last? no, we want the highest revenue-with-zero-spend
      // to sort to the top. Sort ∞ first.
      if (a.roi === Number.POSITIVE_INFINITY && b.roi !== Number.POSITIVE_INFINITY) return -1;
      if (b.roi === Number.POSITIVE_INFINITY && a.roi !== Number.POSITIVE_INFINITY) return 1;
      return b.roi - a.roi;
    });

  const tenantTotals = totals[0] ?? { revenue: 0, spend: 0 };
  const tenantRoi = tenantTotals.spend > 0 ? tenantTotals.revenue / tenantTotals.spend : null;

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-3 gap-2">
        <Card title="Revenue in window">
          <div className="text-2xl font-semibold tabular-nums text-gray-900">
            {formatMoney(tenantTotals.revenue)}
          </div>
          <p className="text-[11px] text-gray-500">From Storm attribution sync.</p>
        </Card>
        <Card title="Spend in window">
          <div className="text-2xl font-semibold tabular-nums text-gray-900">
            {formatMoney(tenantTotals.spend)}
          </div>
          <p className="text-[11px] text-gray-500">Expenses, excluding rejected.</p>
        </Card>
        <Card title="ROI">
          <div className="text-2xl font-semibold tabular-nums text-gray-900">
            {tenantRoi === null ? '—' : `${tenantRoi.toFixed(1)}×`}
          </div>
          <p className="text-[11px] text-gray-500">
            {tenantRoi === null
              ? 'No spend recorded yet.'
              : tenantRoi >= 1
                ? 'Revenue exceeds spend.'
                : 'Spend exceeds revenue — investigate.'}
          </p>
        </Card>
      </div>

      <Card title="Per-rep ROI">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No revenue or spend in this window yet.</p>
        ) : (
          <ol className="divide-y divide-gray-100">
            <li className="hidden grid-cols-[28px_28px_1fr_120px_120px_80px] items-center gap-3 pb-2 text-[10.5px] font-semibold uppercase tracking-label text-gray-500 md:grid">
              <div />
              <div />
              <div>Rep</div>
              <div className="text-right">Revenue</div>
              <div className="text-right">Spend</div>
              <div className="text-right">ROI</div>
            </li>
            {rows.map((row, idx) => (
              <li
                key={row.user!.id}
                className="grid grid-cols-[28px_28px_1fr_120px_120px_80px] items-center gap-3 py-2.5"
              >
                <div className="text-right text-[13px] font-semibold tabular-nums text-gray-400">
                  {idx + 1}
                </div>
                <Avatar name={row.user!.name} color={row.user!.avatarColor} size="md" />
                <div className="min-w-0 text-sm font-medium text-gray-900">{row.user!.name}</div>
                <div className="text-right font-mono text-sm tabular-nums text-gray-900">
                  {formatMoney(row.revenue)}
                </div>
                <div className="text-right font-mono text-sm tabular-nums text-gray-900">
                  {formatMoney(row.spend)}
                </div>
                <div
                  className="text-right font-semibold tabular-nums"
                  style={{ color: roiColor(row.roi) }}
                >
                  {row.roi === Number.POSITIVE_INFINITY
                    ? '∞'
                    : row.roi === 0
                      ? '—'
                      : `${row.roi.toFixed(1)}×`}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function formatMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function roiColor(roi: number): string {
  if (roi === Number.POSITIVE_INFINITY) return '#6366f1';
  if (roi === 0) return '#9ca3af';
  if (roi >= 5) return '#10b981';
  if (roi >= 2) return '#0ea5e9';
  if (roi >= 1) return '#f59e0b';
  return '#ef4444';
}
