/**
 * /admin/state-boards — upload a state licensing-board CSV and ingest it
 * into the prospect queue. Mirrors the NMLS ingestion pattern but covers
 * realty + insurance boards (CO/TX/FL by default; add more in
 * packages/integrations/src/ingest/state-boards.ts → STATE_BOARD_CONFIGS).
 *
 * Permissions: manager+ in the target market.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { Pill } from '@partnerradar/ui';
import { FileSpreadsheet } from 'lucide-react';
import { StateBoardImportClient } from './StateBoardImportClient';

export const dynamic = 'force-dynamic';

export default async function StateBoardsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') redirect('/radar');

  const userMarkets = session.user.markets ?? [];
  const markets = await prisma.market.findMany({
    where: session.user.role === 'ADMIN' ? {} : { id: { in: userMarkets } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  // Recent state-board jobs surface as a "history" panel below the
  // upload form so reps can see what's already been ingested + re-run.
  const recentJobs = await prisma.scrapeJob
    .findMany({
      where: {
        source: { in: ['STATE_REALTY', 'STATE_INSURANCE'] },
        ...(session.user.role === 'ADMIN' ? {} : { marketId: { in: userMarkets } }),
      },
      include: {
        market: { select: { name: true } },
        _count: { select: { leads: true } },
      },
      orderBy: [{ lastRunAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    })
    .catch(() => []);

  // Per-job upload history: leads bucketed by createdAt date give us a
  // workable "this upload brought in N new leads" delta without needing a
  // dedicated StateBoardImport table. Each ingest run inserts new leads
  // within the same minute, so DATE(createdAt) is a stable bucket.
  const jobIds = recentJobs.map((j) => j.id);
  const importsByJob = jobIds.length
    ? await prisma
        .$queryRawUnsafe<
          Array<{
            scrape_job_id: string;
            day: Date;
            count: bigint;
          }>
        >(
          `SELECT "scrapeJobId" AS scrape_job_id,
                  date_trunc('day', "createdAt") AS day,
                  COUNT(*)::bigint AS count
             FROM "ScrapedLead"
            WHERE "scrapeJobId" = ANY($1::text[])
            GROUP BY "scrapeJobId", day
            ORDER BY day DESC`,
          jobIds,
        )
        .catch(() => [])
    : [];
  const historyByJob = new Map<string, Array<{ day: string; count: number }>>();
  for (const row of importsByJob) {
    const list = historyByJob.get(row.scrape_job_id) ?? [];
    list.push({
      day: row.day.toISOString(),
      count: Number(row.count),
    });
    historyByJob.set(row.scrape_job_id, list);
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="border-b border-card-border bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">State board imports</h1>
        </div>
        <p className="mt-1 text-[11px] text-gray-500 sm:text-xs">
          Drop a state realty or insurance board CSV here. We parse, dedupe by license number, and
          drop new licensees into the prospect queue.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto w-full max-w-3xl">
          <StateBoardImportClient
            markets={markets.map((m) => ({ id: m.id, name: m.name }))}
            recentJobs={recentJobs.map((j) => ({
              id: j.id,
              name: j.name,
              source: j.source as 'STATE_REALTY' | 'STATE_INSURANCE',
              marketName: j.market.name,
              leadCount: j._count.leads,
              lastRunAt: j.lastRunAt?.toISOString() ?? null,
              configKey:
                ((j.filters as Record<string, unknown> | null)?.configKey as string) ?? null,
              uploadedFilename:
                ((j.filters as Record<string, unknown> | null)?.uploadedFilename as string) ?? null,
              history: (historyByJob.get(j.id) ?? []).slice(0, 6),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
