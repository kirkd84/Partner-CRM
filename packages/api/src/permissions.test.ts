import { describe, it, expect } from 'vitest';
import { Role } from '@partnerradar/db';
import { can, type AuthorizedUser, type Resource } from './permissions';

const repA: AuthorizedUser = { id: 'u_repA', role: Role.REP, markets: ['m_denver'] };
const repB: AuthorizedUser = { id: 'u_repB', role: Role.REP, markets: ['m_denver'] };
const manager: AuthorizedUser = { id: 'u_mgr', role: Role.MANAGER, markets: ['m_denver'] };
const admin: AuthorizedUser = { id: 'u_admin', role: Role.ADMIN, markets: ['m_denver', 'm_co'] };

const partnerOwnedByA: Resource = {
  kind: 'partner',
  marketId: 'm_denver',
  assignedRepId: 'u_repA',
  archivedAt: null,
};
const unassignedPartner: Resource = {
  kind: 'partner',
  marketId: 'm_denver',
  assignedRepId: null,
  archivedAt: null,
};
const archivedPartner: Resource = {
  kind: 'partner',
  marketId: 'm_denver',
  assignedRepId: 'u_repA',
  archivedAt: new Date(),
};

describe('permissions — partner visibility', () => {
  it('rep can view own partner', () => {
    expect(can(repA, 'partners.view', partnerOwnedByA)).toBe(true);
  });
  it('rep cannot view another rep partner', () => {
    expect(can(repB, 'partners.view', partnerOwnedByA)).toBe(false);
  });
  it('rep can view unassigned partner in their market (claimable)', () => {
    expect(can(repA, 'partners.view', unassignedPartner)).toBe(true);
  });
  it('manager sees all in market', () => {
    expect(can(manager, 'partners.view', partnerOwnedByA)).toBe(true);
    expect(can(manager, 'partners.view', unassignedPartner)).toBe(true);
  });
  it('archived partners are manager+ only', () => {
    expect(can(repA, 'partners.view', archivedPartner)).toBe(false);
    expect(can(manager, 'partners.view', archivedPartner)).toBe(true);
  });
});

describe('permissions — mutation guard', () => {
  it('rep cannot edit another rep partner', () => {
    expect(can(repB, 'partners.update', partnerOwnedByA)).toBe(false);
  });
  it('rep can edit own', () => {
    expect(can(repA, 'partners.update', partnerOwnedByA)).toBe(true);
  });
  it('claim works only when unassigned', () => {
    expect(can(repA, 'partners.claim', unassignedPartner)).toBe(true);
    expect(can(repA, 'partners.claim', partnerOwnedByA)).toBe(false);
  });
  it('manager assigns; rep cannot', () => {
    expect(can(manager, 'partners.assign')).toBe(true);
    expect(can(repA, 'partners.assign')).toBe(false);
  });
  it('activation is manager+', () => {
    expect(can(manager, 'partners.activate')).toBe(true);
    expect(can(repA, 'partners.activate')).toBe(false);
  });
});

describe('permissions — admin-only surface', () => {
  it('hard-deletes are admin-only', () => {
    expect(can(admin, 'users.hard_delete')).toBe(true);
    expect(can(manager, 'users.hard_delete')).toBe(false);
  });
  it('integrations and templates admin-only', () => {
    expect(can(admin, 'integrations.configure')).toBe(true);
    expect(can(manager, 'templates.manage')).toBe(false);
  });
});
