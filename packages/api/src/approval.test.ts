import { describe, it, expect } from 'vitest';
import { decideApproval, DEFAULT_BUDGET_RULE } from './approval';

const RULE = {
  autoApproveUnder: 25,
  managerApproveUnder: 100,
  monthlyBudgetPercentOfRevenue: null,
};
const RULE_WITH_CAP = {
  autoApproveUnder: 25,
  managerApproveUnder: 100,
  monthlyBudgetPercentOfRevenue: 0.05, // 5% of revenue
};

describe('decideApproval — SPEC §6.6 acceptance', () => {
  it('$20 auto-approves under the $25 threshold', () => {
    const d = decideApproval({
      amount: 20,
      rule: RULE,
      monthToDateSpend: 0,
      monthlyRevenueCached: null,
    });
    expect(d.status).toBe('AUTO_APPROVED');
  });

  it('$80 routes to manager (between $25 and $100)', () => {
    const d = decideApproval({
      amount: 80,
      rule: RULE,
      monthToDateSpend: 0,
      monthlyRevenueCached: null,
    });
    expect(d.status).toBe('PENDING_MANAGER');
  });

  it('$500 escalates to admin (over $100)', () => {
    const d = decideApproval({
      amount: 500,
      rule: RULE,
      monthToDateSpend: 0,
      monthlyRevenueCached: null,
    });
    expect(d.status).toBe('PENDING_ADMIN');
  });

  it('exact threshold match stays in the lower bucket ($25 → auto, $100 → manager)', () => {
    expect(
      decideApproval({
        amount: 25,
        rule: RULE,
        monthToDateSpend: 0,
        monthlyRevenueCached: null,
      }).status,
    ).toBe('AUTO_APPROVED');
    expect(
      decideApproval({
        amount: 100,
        rule: RULE,
        monthToDateSpend: 0,
        monthlyRevenueCached: null,
      }).status,
    ).toBe('PENDING_MANAGER');
  });
});

describe('decideApproval — monthly budget cap', () => {
  it('allows a $20 expense when rep is well under their cap', () => {
    const d = decideApproval({
      amount: 20,
      rule: RULE_WITH_CAP,
      monthToDateSpend: 100,
      monthlyRevenueCached: 10_000, // 5% = $500 cap
    });
    expect(d.status).toBe('AUTO_APPROVED');
  });

  it('BLOCKS an expense that would push the rep over their monthly cap', () => {
    const d = decideApproval({
      amount: 20,
      rule: RULE_WITH_CAP,
      monthToDateSpend: 490, // $500 - $490 = $10 headroom, $20 busts it
      monthlyRevenueCached: 10_000, // $500 cap
    });
    expect(d.status).toBe('BLOCKED_OVER_CAP');
    if (d.status === 'BLOCKED_OVER_CAP') {
      expect(d.monthlyCap).toBe(500);
      expect(d.projectedSpend).toBe(510);
    }
  });

  it('ignores the cap when rep has no cached revenue (onboarding / new rep)', () => {
    const d = decideApproval({
      amount: 20,
      rule: RULE_WITH_CAP,
      monthToDateSpend: 10_000,
      monthlyRevenueCached: null,
    });
    expect(d.status).toBe('AUTO_APPROVED');
  });

  it('ignores the cap when rule has null percent (no cap configured)', () => {
    const d = decideApproval({
      amount: 20,
      rule: RULE,
      monthToDateSpend: 10_000,
      monthlyRevenueCached: 50_000,
    });
    expect(d.status).toBe('AUTO_APPROVED');
  });

  it('cap check fires before threshold check — a small expense over cap is BLOCKED, not AUTO', () => {
    const d = decideApproval({
      amount: 5,
      rule: RULE_WITH_CAP,
      monthToDateSpend: 500, // already at cap
      monthlyRevenueCached: 10_000, // $500 cap
    });
    expect(d.status).toBe('BLOCKED_OVER_CAP');
  });
});

describe('DEFAULT_BUDGET_RULE', () => {
  it('matches SPEC-suggested defaults', () => {
    expect(DEFAULT_BUDGET_RULE.autoApproveUnder).toBe(25);
    expect(DEFAULT_BUDGET_RULE.managerApproveUnder).toBe(100);
    expect(DEFAULT_BUDGET_RULE.monthlyBudgetPercentOfRevenue).toBeNull();
  });
});
