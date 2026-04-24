/**
 * /admin/budget-rules — expense approval thresholds per market / per rep.
 *
 * The approval engine (packages/api/src/approval.ts) consults these
 * rules every time someone submits an expense. See actions.ts for the
 * scope hierarchy.
 *
 * We auto-seed the tenant-wide default rule on page load if it's
 * missing — that guarantees the approval engine always has a rule to
 * fall back to, and new tenants don't need a manual setup step.
 */
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Table, THead, TBody, TR, TH, TD, Pill } from '@partnerradar/ui';
import { DollarSign } from 'lucide-react';
import { NewRuleButton, RuleRowActions } from './BudgetRulesClient';

export const dynamic = 'force-dynamic';

export default async function AdminBudgetRulesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') redirect('/radar');

  // Pull rules + reference data in parallel. Graceful if BudgetRule
  // migration hasn't applied yet.
  type RuleRow = {
    id: string;
    marketId: string | null;
    repId: string | null;
    autoApproveUnder: Prisma.Decimal;
    managerApproveUnder: Prisma.Decimal;
    monthlyBudgetPercentOfRevenue: Prisma.Decimal | null;
  };
  let rules: RuleRow[] = [];
  try {
    rules = await prisma.budgetRule.findMany({
      orderBy: [{ marketId: 'asc' }, { repId: 'asc' }],
    });
  } catch {
    rules = [];
  }

  const [markets, reps] = await Promise.all([
    prisma.market
      .findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
      .catch(() => [] as Array<{ id: string; name: string }>),
    prisma.user
      .findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, role: true },
      })
      .catch(() => [] as Array<{ id: string; name: string; role: string }>),
  ]);

  // Seed the tenant-wide default if missing — harmless if a prior run
  // already created it. We pick conservative defaults (SPEC §6.7).
  const hasDefault = rules.some((r) => !r.marketId && !r.repId);
  if (!hasDefault) {
    try {
      const created = await prisma.budgetRule.create({
        data: {
          marketId: null,
          repId: null,
          autoApproveUnder: new Prisma.Decimal(25),
          managerApproveUnder: new Prisma.Decimal(100),
          monthlyBudgetPercentOfRevenue: new Prisma.Decimal(0.05),
        },
      });
      rules = [
        {
          id: created.id,
          marketId: null,
          repId: null,
          autoApproveUnder: created.autoApproveUnder,
          managerApproveUnder: created.managerApproveUnder,
          monthlyBudgetPercentOfRevenue: created.monthlyBudgetPercentOfRevenue,
        },
        ...rules,
      ];
    } catch {
      /* table missing or race — ignore */
    }
  }

  const marketById = new Map(markets.map((m) => [m.id, m.name]));
  const repById = new Map(reps.map((r) => [r.id, r.name]));

  // Sort: default first, then market-only, then rep-only, then most-specific
  const sorted = [...rules].sort((a, b) => specificity(a) - specificity(b));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Budget rules</h1>
          <p className="text-xs text-gray-500">
            Set approval thresholds per market or per rep. The most specific rule wins when an
            expense is submitted.
          </p>
        </div>
        <div className="ml-auto">
          <NewRuleButton markets={markets} reps={reps} />
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-white">
        {sorted.length === 0 ? (
          <div className="p-10 text-center">
            <DollarSign className="mx-auto h-8 w-8 text-gray-300" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No budget rules yet</h3>
            <p className="text-xs text-gray-500">
              The tenant-wide default will be created on reload once the database migration applies.
            </p>
            <p className="mt-3 text-[11px] text-gray-400">
              If you're expecting rules here and they're missing, make sure the{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">BudgetRule</code> table exists —
              Railway auto-applies migrations on boot.
            </p>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Scope</TH>
                <TH>Auto-approve under</TH>
                <TH>Manager-approve under</TH>
                <TH>Monthly cap</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((r) => {
                const isDefault = !r.marketId && !r.repId;
                const marketName = r.marketId ? (marketById.get(r.marketId) ?? '—') : null;
                const repName = r.repId ? (repById.get(r.repId) ?? '—') : null;
                return (
                  <TR key={r.id}>
                    <TD>
                      <div className="flex flex-col gap-1">
                        {isDefault ? (
                          <Pill color="#6366f1" tone="soft">
                            Tenant default
                          </Pill>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {marketName ? (
                              <Pill color="#0ea5e9" tone="soft">
                                Market · {marketName}
                              </Pill>
                            ) : null}
                            {repName ? (
                              <Pill color="#10b981" tone="soft">
                                Rep · {repName}
                              </Pill>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </TD>
                    <TD>
                      <span className="font-mono text-sm text-gray-900">
                        {formatMoney(r.autoApproveUnder)}
                      </span>
                    </TD>
                    <TD>
                      <span className="font-mono text-sm text-gray-900">
                        {formatMoney(r.managerApproveUnder)}
                      </span>
                    </TD>
                    <TD>
                      {r.monthlyBudgetPercentOfRevenue ? (
                        <span className="text-xs text-gray-700">
                          {(Number(r.monthlyBudgetPercentOfRevenue) * 100).toFixed(1)}% of revenue
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No cap</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <RuleRowActions
                        rule={{
                          id: r.id,
                          marketId: r.marketId,
                          repId: r.repId,
                          autoApproveUnder: Number(r.autoApproveUnder),
                          managerApproveUnder: Number(r.managerApproveUnder),
                          monthlyBudgetPercentOfRevenue: r.monthlyBudgetPercentOfRevenue
                            ? Number(r.monthlyBudgetPercentOfRevenue)
                            : null,
                        }}
                        markets={markets}
                        reps={reps}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

/** Lower = less specific. Default (no market, no rep) sorts first. */
function specificity(r: { marketId: string | null; repId: string | null }): number {
  if (!r.marketId && !r.repId) return 0;
  if (r.marketId && !r.repId) return 1;
  if (!r.marketId && r.repId) return 2;
  return 3;
}

function formatMoney(d: Prisma.Decimal): string {
  return `$${Number(d).toFixed(2)}`;
}
