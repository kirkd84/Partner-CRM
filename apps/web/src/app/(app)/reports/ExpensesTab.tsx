/**
 * Expenses tab — spending breakdown over the window.
 *
 * Breakdown by category, by rep, and approval-status split so managers
 * can see which reps sit in the pending queue and where the money is
 * going.
 */

import { prisma, type Prisma } from '@partnerradar/db';
import { Card, Pill } from '@partnerradar/ui';
import { rangeToStart, type RangeId } from './range';

interface Props {
  range: RangeId;
  markets: string[];
  scopeAllMarkets: boolean;
}

export async function ExpensesTab({ range, markets, scopeAllMarkets }: Props) {
  const since = rangeToStart(range);
  const partnerScope: Prisma.PartnerWhereInput = scopeAllMarkets
    ? { archivedAt: null }
    : { archivedAt: null, marketId: { in: markets } };

  const [byCategory, byStatus, byRep, reps, totalAgg, pendingCount] = await Promise.all([
    prisma.expense.groupBy({
      by: ['category'],
      where: {
        occurredOn: { gte: since },
        approvalStatus: { not: 'REJECTED' },
        partner: partnerScope,
      },
      _sum: { amount: true },
      _count: { category: true },
    }),
    prisma.expense.groupBy({
      by: ['approvalStatus'],
      where: { occurredOn: { gte: since }, partner: partnerScope },
      _sum: { amount: true },
      _count: { approvalStatus: true },
    }),
    prisma.expense.groupBy({
      by: ['userId'],
      where: {
        occurredOn: { gte: since },
        approvalStatus: { not: 'REJECTED' },
        partner: partnerScope,
      },
      _sum: { amount: true },
      _count: { userId: true },
    }),
    prisma.user.findMany({ select: { id: true, name: true, role: true } }),
    prisma.expense.aggregate({
      where: {
        occurredOn: { gte: since },
        approvalStatus: { not: 'REJECTED' },
        partner: partnerScope,
      },
      _sum: { amount: true },
    }),
    prisma.expense.count({
      where: { approvalStatus: 'PENDING', partner: partnerScope },
    }),
  ]);

  const repById = new Map(reps.map((r) => [r.id, r]));
  const total = Number(totalAgg._sum.amount ?? 0);

  const statusByKey = new Map<string, { count: number; sum: number }>();
  for (const row of byStatus) {
    statusByKey.set(row.approvalStatus, {
      count: row._count.approvalStatus,
      sum: Number(row._sum.amount ?? 0),
    });
  }

  const categoryRows = byCategory
    .map((row) => ({
      category: row.category,
      count: row._count.category,
      sum: Number(row._sum.amount ?? 0),
    }))
    .sort((a, b) => b.sum - a.sum);

  const repRows = byRep
    .map((row) => ({
      user: repById.get(row.userId),
      count: row._count.userId,
      sum: Number(row._sum.amount ?? 0),
    }))
    .filter((r) => r.user)
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 15);

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-3 gap-2">
        <Card title="Spend in window">
          <div className="text-2xl font-semibold tabular-nums text-gray-900">
            {formatMoney(total)}
          </div>
          <p className="text-[11px] text-gray-500">
            {statusByKey.get('AUTO_APPROVED')?.count ?? 0} auto-approved ·{' '}
            {statusByKey.get('APPROVED')?.count ?? 0} approved
          </p>
        </Card>
        <Card title="Awaiting approval">
          <div className="text-2xl font-semibold tabular-nums text-amber-600">{pendingCount}</div>
          <p className="text-[11px] text-gray-500">
            {formatMoney(statusByKey.get('PENDING')?.sum ?? 0)} in the queue right now.
          </p>
        </Card>
        <Card title="Rejected in window">
          <div className="text-2xl font-semibold tabular-nums text-gray-900">
            {statusByKey.get('REJECTED')?.count ?? 0}
          </div>
          <p className="text-[11px] text-gray-500">
            {formatMoney(statusByKey.get('REJECTED')?.sum ?? 0)} not approved.
          </p>
        </Card>
      </div>

      <Card title="By category">
        {categoryRows.length === 0 ? (
          <p className="text-sm text-gray-500">No expenses in this window.</p>
        ) : (
          <div className="space-y-2">
            {categoryRows.map((row) => {
              const pct = total > 0 ? (row.sum / total) * 100 : 0;
              return (
                <div
                  key={row.category}
                  className="grid grid-cols-[100px_1fr_100px_60px] items-center gap-3"
                >
                  <div className="text-sm text-gray-900">{row.category}</div>
                  <div className="relative h-5 overflow-hidden rounded bg-gray-100">
                    <div className="h-full rounded bg-primary/60" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-right font-mono text-sm tabular-nums text-gray-900">
                    {formatMoney(row.sum)}
                  </div>
                  <div className="text-right text-xs text-gray-500">{row.count}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="By rep">
        {repRows.length === 0 ? (
          <p className="text-sm text-gray-500">No expenses in this window.</p>
        ) : (
          <ol className="divide-y divide-gray-100">
            <li className="hidden grid-cols-[28px_1fr_100px_80px] items-center gap-3 pb-2 text-[10.5px] font-semibold uppercase tracking-label text-gray-500 md:grid">
              <div />
              <div>Rep</div>
              <div className="text-right">Total spend</div>
              <div className="text-right">Count</div>
            </li>
            {repRows.map((row, idx) => (
              <li
                key={row.user!.id}
                className="grid grid-cols-[28px_1fr_100px_80px] items-center gap-3 py-2"
              >
                <div className="text-right text-[13px] font-semibold tabular-nums text-gray-400">
                  {idx + 1}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">{row.user!.name}</span>
                  <Pill color="#6b7280" tone="soft">
                    {row.user!.role.toLowerCase()}
                  </Pill>
                </div>
                <div className="text-right font-mono text-sm tabular-nums text-gray-900">
                  {formatMoney(row.sum)}
                </div>
                <div className="text-right text-xs text-gray-500">{row.count}</div>
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
