/**
 * Centralized permissions matrix — SPEC §5.
 *
 * Every tRPC mutation calls `can(user, action, resource)` before touching
 * the database. The UI should also hide affordances via `useCan()` (client
 * shim that calls the same function with a lighter types). Two layers keep
 * mistakes cheap: if the UI exposes a button by mistake, the tRPC call
 * still returns FORBIDDEN.
 */
import { Role } from '@partnerradar/db';

export type AuthorizedUser = {
  id: string;
  role: Role;
  markets: string[]; // market IDs the user belongs to
};

export type Resource =
  | { kind: 'partner'; marketId: string; assignedRepId: string | null; archivedAt: Date | null }
  | { kind: 'expense'; userId: string; amount: number }
  | { kind: 'user'; id: string; role: Role }
  | { kind: 'market'; id: string }
  | { kind: 'audit_log' }
  | { kind: 'scrape_queue'; marketId: string }
  | { kind: 'template' }
  | { kind: 'cadence' }
  | { kind: 'budget_rule' }
  | { kind: 'integration' }
  | { kind: 'report' };

export type Action =
  // Partners
  | 'partners.view'
  | 'partners.create'
  | 'partners.update'
  | 'partners.claim'
  | 'partners.assign'
  | 'partners.archive'
  | 'partners.hard_delete'
  | 'partners.activate'
  | 'partners.merge_duplicates'
  // Expenses
  | 'expenses.submit'
  | 'expenses.view_own_roi'
  | 'expenses.view_others_roi'
  | 'expenses.approve_tier1' // manager tier
  | 'expenses.approve_tier2' // admin tier
  // Users / Admin
  | 'users.create'
  | 'users.deactivate'
  | 'users.hard_delete'
  | 'users.view_audit_log'
  // Scraping
  | 'scrape.configure'
  | 'scrape.review'
  // Markets & config
  | 'markets.configure'
  | 'integrations.configure'
  | 'templates.manage'
  | 'cadences.manage'
  | 'budget_rules.manage'
  | 'ai.autonomy_defaults'
  | 'bulk.export'
  | 'reports.view';

export function can(user: AuthorizedUser, action: Action, resource?: Resource): boolean {
  const isAdmin = user.role === Role.ADMIN;
  const isManagerPlus = isAdmin || user.role === Role.MANAGER;

  switch (action) {
    case 'partners.view':
      if (resource?.kind !== 'partner') return false;
      if (resource.archivedAt && !isManagerPlus) return false;
      if (isManagerPlus) return user.markets.includes(resource.marketId);
      // Reps: own or unassigned in their market
      return (
        user.markets.includes(resource.marketId) &&
        (resource.assignedRepId === user.id || resource.assignedRepId === null)
      );

    case 'partners.create':
      return true; // any authenticated user can create; marketId validated elsewhere

    case 'partners.update':
      if (resource?.kind !== 'partner') return false;
      if (isManagerPlus) return user.markets.includes(resource.marketId);
      return (
        user.markets.includes(resource.marketId) && resource.assignedRepId === user.id
      );

    case 'partners.claim':
      if (resource?.kind !== 'partner') return false;
      return user.markets.includes(resource.marketId) && resource.assignedRepId === null;

    case 'partners.assign':
    case 'partners.archive':
    case 'partners.merge_duplicates':
    case 'partners.activate':
    case 'scrape.configure':
    case 'scrape.review':
    case 'expenses.approve_tier1':
    case 'expenses.view_others_roi':
    case 'users.create':
    case 'users.deactivate':
    case 'users.view_audit_log':
    case 'bulk.export':
    case 'reports.view':
      return isManagerPlus;

    case 'partners.hard_delete':
    case 'users.hard_delete':
    case 'expenses.approve_tier2':
    case 'markets.configure':
    case 'integrations.configure':
    case 'templates.manage':
    case 'cadences.manage':
    case 'budget_rules.manage':
    case 'ai.autonomy_defaults':
      return isAdmin;

    case 'expenses.submit':
    case 'expenses.view_own_roi':
      return true;

    default: {
      // Exhaustiveness check — compile error if a new Action isn't handled.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
