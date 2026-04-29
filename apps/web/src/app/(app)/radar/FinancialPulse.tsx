/**
 * Radar → Financial pulse strip.
 *
 * A compact horizontal bar that sits at the top of /radar and answers
 * three questions at a glance:
 *   1. How much have we spent this month?
 *   2. How much did we cap ourselves at?
 *   3. How much revenue have we attributed this month?
 *
 * It renders in a server-only file so the DB hits happen at render time
 * and the resulting HTML is static — no loading skeleton.
 *
 * Spend = sum(Expense.amount) where !REJECTED, occurredOn in [monthStart, now]
 * Budget = (most-specific BudgetRule for the caller) × last-month revenue
 * Revenue = sum(RevenueAttribution.amount) this month
 *
 * All three values scope to the caller's markets for reps; admins see
 * the full tenant total since they manage budgets cross-market anyway.
 */

import { prisma } from '@partnerradar/db';
import type { Session } from 'next-auth';
import { DollarSign, Wallet, TrendingUp } from 'lucide-react';

interface FinancialPulseProps {
  session: Session;
}

export async function FinancialPulse({ session }: FinancialPulseProps) {
  if (!session.user) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'MANAGER';

  // Partners scope — reps see their own markets; admins see tenant.
  const partnerScope = isAdmin
    ? {}
    : {
        marketId: { in: session.user.markets ?? [] },
      };

  // Pull spend + revenue + last-month revenue + rules in parallel.
  const [spendAgg, revenueMtdAgg, revenueLastMonthAgg, ruleRows] = await Promise.all([
    prisma.expense
      .aggregate({
        where: {
          approvalStatus: { not: 'REJECTED' },
          occurredOn: { gte: monthStart, lte: now },
          partner: partnerScope,
        },
        _sum: { amount: true },
      })
      .catch(() => ({ _sum: { amount: null } })),
    prisma.revenueAttribution
      .aggregate({
        where: {
          earnedOn: { gte: monthStart, lte: now },
          partner: partnerScope,
        },
        _sum: { amount: true },
      })
      .catch(() => ({ _sum: { amount: null } })),
    prisma.revenueAttribution
      .aggregate({
        where: {
          earnedOn: { gte: lastMonthStart, lte: lastMonthEnd },
          partner: partnerScope,
        },
        _sum: { amount: true },
      })
      .catch(() => ({ _sum: { amount: null } })),
    prisma.budgetRule
      .findMany({
        where: {
          OR: [
            { repId: session.user.id },
            ...(session.user.markets ?? []).map((m) => ({ marketId: m, repId: null })),
            { repId: null, marketId: null },
          ],
        },
        select: {
          repId: true,
          marketId: true,
          autoApproveUnder: true,
          managerApproveUnder: true,
          monthlyBudgetPercentOfRevenue: true,
        },
      })
      .catch(
        () =>
          [] as Array<{
            repId: string | null;
            marketId: string | null;
            autoApproveUnder: unknown;
            managerApproveUnder: unknown;
            monthlyBudgetPercentOfRevenue: unknown;
          }>,
      ),
  ]);

  const spent = Number(spendAgg._sum.amount ?? 0);
  const revenueMtd = Number(revenueMtdAgg._sum.amount ?? 0);
  const revenueLastMonth = Number(revenueLastMonthAgg._sum.amount ?? 0);

  // Pick the most specific rule for THIS caller: rep+any > any+market > default
  // (rep+market combos aren't represented here because Radar is for the caller
  // as a whole, across all their markets).
  const rule =
    ruleRows.find((r) => r.repId === session.user.id) ??
    ruleRows.find((r) => r.marketId && (session.user.markets ?? []).includes(r.marketId)) ??
    ruleRows.find((r) => !r.repId && !r.marketId);

  const pct = rule?.monthlyBudgetPercentOfRevenue
    ? Number(rule.monthlyBudgetPercentOfRevenue)
    : null;
  const budget = pct !== null && revenueLastMonth > 0 ? revenueLastMonth * pct : null;

  const pctUsed = budget && budget > 0 ? Math.min(100, (spent / budget) * 100) : null;
  const overBudget = budget !== null && spent > budget;
  const warn = pctUsed !== null && pctUsed >= 80 && !overBudget;

  // Color ramp — green while under 80%, amber 80-100%, red over budget.
  const barColor = overBudget ? '#ef4444' : warn ? '#f59e0b' : '#10b981';
  const spentColor = overBudget ? '#b91c1c' : warn ? '#b45309' : '#111827';

  return (
    <section aria-label="Financial pulse">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-label text-gray-600">
          Financial pulse · {monthLabel(now)}
        </div>
        <div className="text-[11px] text-gray-400">
          {isAdmin ? 'Tenant-wide' : `Your markets (${(session.user.markets ?? []).length})`}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-lg border border-card-border bg-white p-3 md:grid-cols-3">
        {/* Spent MTD */}
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md"
            style={{ backgroundColor: `${spentColor}14`, color: spentColor }}
          >
            <DollarSign className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-label text-gray-500">Spent MTD</div>
            <div className="text-lg font-semibold tabular-nums" style={{ color: spentColor }}>
              {formatMoney(spent)}
            </div>
            {budget !== null ? (
              <div className="mt-1 text-[11px] text-gray-500">{pctUsed!.toFixed(0)}% of budget</div>
            ) : (
              <div className="mt-1 text-[11px] text-gray-400">No cap set</div>
            )}
          </div>
        </div>

        {/* Budget */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <Wallet className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-label text-gray-500">Monthly budget</div>
            {budget !== null ? (
              <>
                <div className="text-lg font-semibold tabular-nums text-gray-900">
                  {formatMoney(budget)}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {pct !== null ? `${(pct * 100).toFixed(1)}% of last-month revenue` : ''}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-gray-500">Uncapped</div>
                <div className="mt-1 text-[11px] text-gray-400">
                  Set one in{' '}
                  <a className="text-blue-600 hover:underline" href="/admin/budget-rules">
                    Budget rules
                  </a>
                </div>
              </>
            )}
            {budget !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pctUsed ?? 0}%`, backgroundColor: barColor }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Revenue MTD */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
            <TrendingUp className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-label text-gray-500">Revenue MTD</div>
            <div className="text-lg font-semibold tabular-nums text-gray-900">
              {formatMoney(revenueMtd)}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              {spent > 0 && revenueMtd > 0
                ? `${(revenueMtd / spent).toFixed(1)}× ROI this month`
                : revenueLastMonth > 0
                  ? `Last month: ${formatMoney(revenueLastMonth)}`
                  : 'Syncs from Storm every 6 hours'}
            </div>
          </div>
        </div>
      </div>

      {overBudget && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <strong>Over budget.</strong> New expense submissions are blocked until next month —
          admins can raise the cap in{' '}
          <a className="font-semibold underline" href="/admin/budget-rules">
            Budget rules
          </a>
          .
        </div>
      )}
    </section>
  );
}

function formatMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
