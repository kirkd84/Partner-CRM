/**
 * Expense approval engine — SPEC §6.6.
 *
 * Pure function. Given:
 *   • the expense amount
 *   • the BudgetRule the rep falls under (defaulted if none)
 *   • the rep's month-to-date spend so far
 *   • the rep's cached monthly revenue (used to compute monthly cap)
 *
 * returns a decision:
 *   • AUTO_APPROVED  — book immediately
 *   • PENDING_MANAGER — notify market managers
 *   • PENDING_ADMIN   — notify admins (big spend)
 *   • BLOCKED_OVER_CAP — refuse (admin can override with reason)
 *
 * Reasons are surfaced in the UI + AuditLog for traceability. All
 * arithmetic uses plain numbers; callers should convert Decimals up
 * front so this stays hot-path safe.
 */
export type ApprovalDecision =
  | { status: 'AUTO_APPROVED'; reason: string }
  | { status: 'PENDING_MANAGER'; reason: string }
  | { status: 'PENDING_ADMIN'; reason: string }
  | { status: 'BLOCKED_OVER_CAP'; reason: string; monthlyCap: number; projectedSpend: number };

export interface ApprovalInputs {
  amount: number;
  rule: {
    autoApproveUnder: number;
    managerApproveUnder: number;
    /** Fraction of the rep's monthly revenue that caps total spend. Null = no cap. */
    monthlyBudgetPercentOfRevenue: number | null;
  };
  /** Rep's month-to-date spend BEFORE this expense. */
  monthToDateSpend: number;
  /** Rep's cached monthly revenue (from Storm sync). Null means no cap applies. */
  monthlyRevenueCached: number | null;
}

export function decideApproval(input: ApprovalInputs): ApprovalDecision {
  const { amount, rule, monthToDateSpend, monthlyRevenueCached } = input;

  // Monthly cap check FIRST — a $20 latte that pushes the rep over
  // their monthly budget should be blocked, not auto-approved.
  if (rule.monthlyBudgetPercentOfRevenue != null && monthlyRevenueCached != null) {
    const cap = monthlyRevenueCached * rule.monthlyBudgetPercentOfRevenue;
    const projected = monthToDateSpend + amount;
    if (projected > cap) {
      return {
        status: 'BLOCKED_OVER_CAP',
        reason: `Monthly cap $${cap.toFixed(2)} would be exceeded — projected $${projected.toFixed(
          2,
        )} after this expense`,
        monthlyCap: cap,
        projectedSpend: projected,
      };
    }
  }

  if (amount <= rule.autoApproveUnder) {
    return {
      status: 'AUTO_APPROVED',
      reason: `Auto-approved — under $${rule.autoApproveUnder.toFixed(2)} threshold`,
    };
  }
  if (amount <= rule.managerApproveUnder) {
    return {
      status: 'PENDING_MANAGER',
      reason: `Awaits manager approval — between $${rule.autoApproveUnder.toFixed(
        2,
      )} and $${rule.managerApproveUnder.toFixed(2)}`,
    };
  }
  return {
    status: 'PENDING_ADMIN',
    reason: `Awaits admin approval — over $${rule.managerApproveUnder.toFixed(2)}`,
  };
}

export const DEFAULT_BUDGET_RULE = {
  autoApproveUnder: 25,
  managerApproveUnder: 100,
  monthlyBudgetPercentOfRevenue: null as number | null,
};
