/**
 * Storm revenue sync — fetches attributed revenue from Storm Cloud
 * every 6 hours and upserts into RevenueAttribution.
 *
 * Flow:
 *   1. Every 6h, list every partner that has a stormCloudId.
 *   2. For each, call getAttributedRevenue(stormCloudId, sinceCursor).
 *   3. Upsert rows keyed by stormCloudProjectId (the @@unique in schema).
 *   4. Advance a per-partner cursor to (max earnedOn) so next sync is
 *      incremental.
 *
 * Graceful degradation: if no STORM_API_MODE or the client is mock and
 * its seed data is empty, the job just runs to completion with a 0-row
 * summary. The Radar financial pulse + partner detail panels keep
 * rendering their "no data yet" states.
 *
 * This job also exposes a one-shot `syncOnePartnerRevenue` callable from
 * server actions — handy for an admin "Sync now" button next to a
 * partner.
 */

import { inngest } from '../inngest-client';
import { prisma, Prisma } from '@partnerradar/db';
import { stormClient, stormClientMode } from '@partnerradar/integrations';

const DEFAULT_LOOKBACK_DAYS = 180;

/**
 * Shared implementation — safe to call from Inngest steps or server actions.
 * Returns stats so the caller can surface them to the user.
 */
export async function syncOnePartnerRevenue(partnerId: string): Promise<{
  ok: boolean;
  synced: number;
  newRows: number;
  error?: string;
}> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, stormCloudId: true, companyName: true },
  });
  if (!partner) return { ok: false, synced: 0, newRows: 0, error: 'partner not found' };
  if (!partner.stormCloudId) {
    return { ok: false, synced: 0, newRows: 0, error: 'partner has no stormCloudId' };
  }

  // Lookback: either the last row we have for this partner, or the default
  // window if we've never synced them.
  const latest = await prisma.revenueAttribution
    .aggregate({
      where: { partnerId: partner.id },
      _max: { earnedOn: true },
    })
    .catch(() => ({ _max: { earnedOn: null as Date | null } }));

  const since =
    latest._max.earnedOn ?? new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  let rows;
  try {
    rows = await stormClient().getAttributedRevenue(partner.stormCloudId, since);
  } catch (err) {
    return {
      ok: false,
      synced: 0,
      newRows: 0,
      error: err instanceof Error ? err.message : 'storm fetch failed',
    };
  }

  if (rows.length === 0) {
    return { ok: true, synced: 0, newRows: 0 };
  }

  // Upsert via @@unique on stormCloudProjectId so re-syncs don't duplicate.
  let newRows = 0;
  for (const r of rows) {
    const result = await prisma.revenueAttribution.upsert({
      where: { stormCloudProjectId: r.stormCloudProjectId },
      create: {
        partnerId: partner.id,
        stormCloudProjectId: r.stormCloudProjectId,
        amount: new Prisma.Decimal(r.amount),
        earnedOn: new Date(r.earnedOn),
      },
      update: {
        amount: new Prisma.Decimal(r.amount),
        earnedOn: new Date(r.earnedOn),
        syncedAt: new Date(),
      },
      select: { syncedAt: true, id: true },
    });
    // rough heuristic for "new" — within the last 5s of upsert time
    if (Math.abs(Date.now() - result.syncedAt.getTime()) < 5000) newRows++;
  }

  return { ok: true, synced: rows.length, newRows };
}

/**
 * Inngest cron — every 6 hours. Walks all partners with a stormCloudId
 * and runs syncOnePartnerRevenue for each inside its own step so a
 * single failure doesn't abort the whole batch.
 */
export const stormRevenueSyncCron = inngest.createFunction(
  {
    id: 'storm-revenue-sync-cron',
    name: 'Storm · revenue sync (every 6h)',
    // 6-hour concurrency key ensures we never fan out across overlapping
    // runs if one takes longer than expected.
    concurrency: { key: "'storm-revenue'", limit: 1 },
  },
  { cron: '0 */6 * * *' },
  async ({ step, logger }) => {
    const mode = stormClientMode();
    logger.info?.('storm-revenue-sync starting', { mode });

    const partners = await step.run('list-partners', async () => {
      return prisma.partner.findMany({
        where: { stormCloudId: { not: null } },
        select: { id: true, stormCloudId: true, companyName: true },
      });
    });

    if (partners.length === 0) {
      logger.info?.('storm-revenue-sync: no activated partners — skipping');
      return { ok: true, partnerCount: 0, totalRows: 0, totalNew: 0 };
    }

    let totalRows = 0;
    let totalNew = 0;
    let failures = 0;

    for (const p of partners) {
      const res = await step.run(`sync-${p.id}`, async () => {
        return syncOnePartnerRevenue(p.id);
      });
      if (!res.ok) {
        failures++;
        logger.warn?.(`storm-revenue-sync: failed ${p.companyName}`, { error: res.error });
        continue;
      }
      totalRows += res.synced;
      totalNew += res.newRows;
    }

    return {
      ok: true,
      partnerCount: partners.length,
      totalRows,
      totalNew,
      failures,
    };
  },
);

/**
 * Manual trigger (fired after a partner activates, or from an admin
 * "Sync now" button). Concurrency-keyed per partner so two reps
 * hitting the button simultaneously don't double-sync the same row.
 */
export const stormRevenueSyncOnDemand = inngest.createFunction(
  {
    id: 'storm-revenue-sync-on-demand',
    name: 'Storm · revenue sync (on-demand)',
    concurrency: { key: 'event.data.partnerId', limit: 1 },
  },
  { event: 'partner-portal/storm-revenue.sync' },
  async ({ event, step }) => {
    const partnerId = String(event.data?.partnerId ?? '');
    if (!partnerId) return { ok: false, error: 'missing partnerId' };
    return step.run('sync', async () => syncOnePartnerRevenue(partnerId));
  },
);
