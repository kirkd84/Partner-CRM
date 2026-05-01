/**
 * Touchpoint scanner — turns Contact birthdays + Partner business
 * anniversaries + partnership milestones into upcoming Touchpoint rows.
 *
 * Designed to be cheap + idempotent so a daily cron can run it without
 * scheduling the same congrats twice. Idempotency hinges on
 * Touchpoint.uniqueKey:
 *   - BIRTHDAY:               "birthday:{contactId}:{year}"
 *   - BUSINESS_ANNIVERSARY:   "biz-anniv:{partnerId}:{year}"
 *   - PARTNERSHIP_MILESTONE:  "partner-anniv:{partnerId}:{year}"
 *
 * Returns counts so the cron route + admin trigger can show what was
 * scheduled. Existing rows in any non-CANCELED status are kept as-is.
 */

import { prisma } from '@partnerradar/db';

export interface ScanInput {
  /** Optional tenant scope. If null, scans every market the caller has. */
  tenantId?: string | null;
  /** Optional market scope. If null, all markets in the tenant. */
  marketId?: string | null;
  /** Days ahead to consider "upcoming". Default 30. */
  windowDays?: number;
  /** Now() override for tests; default new Date(). */
  now?: Date;
}

export interface ScanResult {
  scheduled: number;
  alreadyScheduled: number;
  byKind: { BIRTHDAY: number; BUSINESS_ANNIVERSARY: number; PARTNERSHIP_MILESTONE: number };
}

/**
 * Default partnership-anniversary years to celebrate. Per-tenant
 * overrides via Tenant.milestoneYears (set in /admin/tenant); empty
 * array there falls back to this list.
 */
const DEFAULT_MILESTONE_YEARS: number[] = [1, 2, 3, 5, 7, 10, 15, 20, 25, 30];

export async function scanTouchpoints(input: ScanInput = {}): Promise<ScanResult> {
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? 30;
  const horizon = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const result: ScanResult = {
    scheduled: 0,
    alreadyScheduled: 0,
    byKind: { BIRTHDAY: 0, BUSINESS_ANNIVERSARY: 0, PARTNERSHIP_MILESTONE: 0 },
  };

  // ── Scope: which partners are we scanning? ──
  const partnerWhere: Record<string, unknown> = {
    archivedAt: null,
  };
  if (input.marketId) {
    partnerWhere.marketId = input.marketId;
  } else if (input.tenantId) {
    const ms = await prisma.market.findMany({
      where: { tenantId: input.tenantId },
      select: { id: true },
    });
    partnerWhere.marketId = { in: ms.map((m) => m.id) };
  }

  const partners = await prisma.partner.findMany({
    where: partnerWhere,
    select: {
      id: true,
      marketId: true,
      companyName: true,
      businessAnniversaryOn: true,
      partneredOn: true,
      contacts: {
        select: {
          id: true,
          name: true,
          birthMonth: true,
          birthDay: true,
        },
      },
    },
  });

  // tenantId is informational on the row — fetch via the market join.
  const marketTenants = new Map<string, string | null>();
  if (partners.length > 0) {
    const ms = await prisma.market.findMany({
      where: { id: { in: [...new Set(partners.map((p) => p.marketId))] } },
      select: { id: true, tenantId: true },
    });
    for (const m of ms) marketTenants.set(m.id, m.tenantId);
  }

  // Pull every tenant's custom milestone years (if configured). Each
  // partner picks up its tenant's list; tenant-less partners use the
  // default. Built once outside the partner loop so we don't query
  // the Tenant table per partner.
  const tenantMilestoneYears = new Map<string | null, Set<number>>();
  const tenantIds = [...new Set([...marketTenants.values()].filter((t) => t != null))] as string[];
  if (tenantIds.length > 0) {
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, milestoneYears: true },
    });
    for (const t of tenants) {
      const years =
        t.milestoneYears && t.milestoneYears.length > 0
          ? t.milestoneYears
          : DEFAULT_MILESTONE_YEARS;
      tenantMilestoneYears.set(t.id, new Set(years));
    }
  }
  tenantMilestoneYears.set(null, new Set(DEFAULT_MILESTONE_YEARS));
  function milestoneSetFor(marketId: string): Set<number> {
    const tenantId = marketTenants.get(marketId) ?? null;
    return tenantMilestoneYears.get(tenantId) ?? new Set(DEFAULT_MILESTONE_YEARS);
  }

  // Buffer the rows we want to upsert. We do this in one batch at the
  // end so a single `findMany` picks up existing keys for the dedupe.
  type Pending = {
    uniqueKey: string;
    partnerId: string;
    marketId: string;
    contactId: string | null;
    kind: 'BIRTHDAY' | 'BUSINESS_ANNIVERSARY' | 'PARTNERSHIP_MILESTONE';
    occurrenceOn: Date;
    scheduledFor: Date;
    meta: Record<string, unknown>;
  };
  const pending: Pending[] = [];

  for (const p of partners) {
    // Birthdays
    for (const c of p.contacts) {
      if (!c.birthMonth || !c.birthDay) continue;
      const occ = nextOccurrence(now, c.birthMonth, c.birthDay);
      if (occ > horizon) continue;
      pending.push({
        uniqueKey: `birthday:${c.id}:${occ.getUTCFullYear()}`,
        partnerId: p.id,
        marketId: p.marketId,
        contactId: c.id,
        kind: 'BIRTHDAY',
        occurrenceOn: occ,
        scheduledFor: morningOf(occ),
        meta: { contactName: c.name, companyName: p.companyName },
      });
    }
    // Business anniversaries
    if (p.businessAnniversaryOn) {
      const ba = p.businessAnniversaryOn;
      const occ = nextOccurrence(now, ba.getUTCMonth() + 1, ba.getUTCDate());
      if (occ <= horizon) {
        pending.push({
          uniqueKey: `biz-anniv:${p.id}:${occ.getUTCFullYear()}`,
          partnerId: p.id,
          marketId: p.marketId,
          contactId: null,
          kind: 'BUSINESS_ANNIVERSARY',
          occurrenceOn: occ,
          scheduledFor: morningOf(occ),
          meta: {
            companyName: p.companyName,
            yearsInBusiness: occ.getUTCFullYear() - ba.getUTCFullYear(),
          },
        });
      }
    }
    // Partnership milestones (1yr, 2yr, etc.) — tenant-configurable.
    if (p.partneredOn) {
      const po = p.partneredOn;
      const occ = nextOccurrence(now, po.getUTCMonth() + 1, po.getUTCDate());
      const years = occ.getUTCFullYear() - po.getUTCFullYear();
      const milestoneSet = milestoneSetFor(p.marketId);
      if (years >= 1 && milestoneSet.has(years) && occ <= horizon) {
        pending.push({
          uniqueKey: `partner-anniv:${p.id}:${occ.getUTCFullYear()}`,
          partnerId: p.id,
          marketId: p.marketId,
          contactId: null,
          kind: 'PARTNERSHIP_MILESTONE',
          occurrenceOn: occ,
          scheduledFor: morningOf(occ),
          meta: { companyName: p.companyName, years },
        });
      }
    }
  }

  if (pending.length === 0) return result;

  // Bulk-check existing keys.
  const existing = await prisma.touchpoint.findMany({
    where: { uniqueKey: { in: pending.map((q) => q.uniqueKey) } },
    select: { uniqueKey: true },
  });
  const seen = new Set(existing.map((e) => e.uniqueKey));

  for (const q of pending) {
    if (seen.has(q.uniqueKey)) {
      result.alreadyScheduled++;
      continue;
    }
    try {
      await prisma.touchpoint.create({
        data: {
          tenantId: marketTenants.get(q.marketId) ?? null,
          marketId: q.marketId,
          partnerId: q.partnerId,
          contactId: q.contactId,
          kind: q.kind,
          occurrenceOn: q.occurrenceOn,
          scheduledFor: q.scheduledFor,
          // Default channel: SMS for birthdays (personal), MANUAL for
          // anniversaries (rep should write something thoughtful).
          // Manager can toggle on the touchpoints page.
          channel: q.kind === 'BIRTHDAY' ? 'SMS' : 'MANUAL',
          status: 'SCHEDULED',
          meta: q.meta as object,
          uniqueKey: q.uniqueKey,
        },
      });
      result.scheduled++;
      result.byKind[q.kind]++;
    } catch {
      // Race — another scanner created it between our check + insert.
      // Counts as alreadyScheduled.
      result.alreadyScheduled++;
    }
  }
  return result;
}

/**
 * Given today's date and a month+day, return the next occurrence
 * date — this year if it hasn't happened yet, next year otherwise.
 * Returned as a UTC Date at midnight so all touchpoint scheduling is
 * timezone-stable.
 */
export function nextOccurrence(now: Date, month: number, day: number): Date {
  const yearNow = now.getUTCFullYear();
  const tryThis = new Date(Date.UTC(yearNow, month - 1, day, 0, 0, 0));
  if (tryThis.getTime() < startOfDayUtc(now).getTime()) {
    return new Date(Date.UTC(yearNow + 1, month - 1, day, 0, 0, 0));
  }
  return tryThis;
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** 9am UTC of the given UTC date. Reps in MT/PT will see "early morning" — close enough. */
function morningOf(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0, 0));
}
