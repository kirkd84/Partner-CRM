'use server';

/**
 * Budget rule admin actions.
 *
 * A "budget rule" is the policy that decides whether an expense needs
 * approval, and from whom. The approval engine (packages/api/src/approval.ts)
 * looks up the most-specific rule for a (repId, marketId) pair, falling back
 * to the tenant-wide default rule (marketId=null + repId=null).
 *
 * We let managers/admins edit rules here. Deleting a rule just removes
 * the override — the default always survives.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';

export interface BudgetRuleInput {
  marketId: string | null;
  repId: string | null;
  autoApproveUnder: number;
  managerApproveUnder: number;
  monthlyBudgetPercentOfRevenue: number | null;
}

async function assertManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN: manager+ required');
  }
  return session;
}

function normalize(input: BudgetRuleInput) {
  const auto = Number(input.autoApproveUnder);
  const mgr = Number(input.managerApproveUnder);
  if (!Number.isFinite(auto) || auto < 0) throw new Error('Auto-approve amount must be ≥ 0');
  if (!Number.isFinite(mgr) || mgr < auto) {
    throw new Error('Manager-approve amount must be ≥ auto-approve amount');
  }
  let pct: number | null = null;
  if (
    input.monthlyBudgetPercentOfRevenue !== null &&
    input.monthlyBudgetPercentOfRevenue !== undefined
  ) {
    const p = Number(input.monthlyBudgetPercentOfRevenue);
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error('Monthly budget % must be between 0 and 1 (e.g. 0.05 = 5%)');
    }
    pct = p;
  }
  return {
    marketId: input.marketId || null,
    repId: input.repId || null,
    autoApproveUnder: new Prisma.Decimal(auto),
    managerApproveUnder: new Prisma.Decimal(mgr),
    monthlyBudgetPercentOfRevenue: pct === null ? null : new Prisma.Decimal(pct),
  };
}

export async function createBudgetRule(input: BudgetRuleInput) {
  const session = await assertManagerPlus();
  const data = normalize(input);

  // Don't let two overrides collide on the same (market, rep) pair —
  // the approval lookup would be ambiguous.
  const existing = await prisma.budgetRule.findFirst({
    where: { marketId: data.marketId, repId: data.repId },
  });
  if (existing) {
    throw new Error(
      'A rule already exists for that combo. Edit the existing rule instead of creating a duplicate.',
    );
  }

  const created = await prisma.budgetRule.create({ data });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'budget_rule',
      entityId: created.id,
      action: 'create',
      diff: {
        marketId: data.marketId,
        repId: data.repId,
        autoApproveUnder: auto(data.autoApproveUnder),
        managerApproveUnder: auto(data.managerApproveUnder),
        monthlyBudgetPercentOfRevenue: data.monthlyBudgetPercentOfRevenue
          ? Number(data.monthlyBudgetPercentOfRevenue)
          : null,
      } as Prisma.InputJsonValue,
    },
  });
  revalidatePath('/admin/budget-rules');
}

export async function updateBudgetRule(id: string, input: BudgetRuleInput) {
  const session = await assertManagerPlus();
  const data = normalize(input);

  const prev = await prisma.budgetRule.findUnique({ where: { id } });
  if (!prev) throw new Error('NOT_FOUND');

  // Detect collision if the user reassigned the rule to a pair another
  // rule already occupies.
  if (prev.marketId !== data.marketId || prev.repId !== data.repId) {
    const clash = await prisma.budgetRule.findFirst({
      where: { marketId: data.marketId, repId: data.repId, NOT: { id } },
    });
    if (clash) {
      throw new Error('Another rule already covers that market/rep combo — edit that one instead.');
    }
  }

  await prisma.$transaction([
    prisma.budgetRule.update({ where: { id }, data }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'budget_rule',
        entityId: id,
        action: 'update',
        diff: {
          before: {
            marketId: prev.marketId,
            repId: prev.repId,
            autoApproveUnder: Number(prev.autoApproveUnder),
            managerApproveUnder: Number(prev.managerApproveUnder),
            monthlyBudgetPercentOfRevenue: prev.monthlyBudgetPercentOfRevenue
              ? Number(prev.monthlyBudgetPercentOfRevenue)
              : null,
          },
          after: {
            marketId: data.marketId,
            repId: data.repId,
            autoApproveUnder: auto(data.autoApproveUnder),
            managerApproveUnder: auto(data.managerApproveUnder),
            monthlyBudgetPercentOfRevenue: data.monthlyBudgetPercentOfRevenue
              ? Number(data.monthlyBudgetPercentOfRevenue)
              : null,
          },
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/budget-rules');
}

export async function deleteBudgetRule(id: string) {
  const session = await assertManagerPlus();
  const prev = await prisma.budgetRule.findUnique({ where: { id } });
  if (!prev) throw new Error('NOT_FOUND');

  // Refuse to delete the tenant-wide default — keep a backstop rule so
  // the approval engine never hits a "no rule found" case.
  if (!prev.marketId && !prev.repId) {
    throw new Error(
      'This is the tenant-wide default rule. Edit it instead — a default must always exist.',
    );
  }

  await prisma.$transaction([
    prisma.budgetRule.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'budget_rule',
        entityId: id,
        action: 'delete',
        diff: {
          marketId: prev.marketId,
          repId: prev.repId,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/budget-rules');
}

/** Helper — Prisma.Decimal → plain number for audit JSON. */
function auto(d: Prisma.Decimal): number {
  return Number(d);
}
