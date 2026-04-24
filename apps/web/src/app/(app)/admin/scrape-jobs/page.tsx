/**
 * /admin/scrape-jobs — manage recurring scrape jobs that feed
 * /admin/scraped-leads. Each job is per-market and per-source. For
 * GOOGLE_PLACES we capture (partnerType, centerLat, centerLng, radiusMi,
 * maxResults) and the "Run now" button kicks the runner immediately.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { Pill } from '@partnerradar/ui';
import { ScrapeJobsClient } from './ScrapeJobsClient';
import { ListChecks } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ScrapeJobsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') redirect('/radar');

  const userMarkets = session.user.markets ?? [];
  const markets = await prisma.market.findMany({
    where: session.user.role === 'ADMIN' ? {} : { id: { in: userMarkets } },
    select: { id: true, name: true, timezone: true },
    orderBy: { name: 'asc' },
  });

  const jobs = await prisma.scrapeJob
    .findMany({
      where: session.user.role === 'ADMIN' ? {} : { marketId: { in: userMarkets } },
      include: {
        market: { select: { name: true } },
        _count: { select: { leads: true } },
      },
      orderBy: [{ active: 'desc' }, { lastRunAt: 'desc' }, { name: 'asc' }],
    })
    .catch(() => []);

  const rows = jobs.map((j) => ({
    id: j.id,
    name: j.name,
    source: j.source as
      | 'GOOGLE_PLACES'
      | 'NMLS'
      | 'STATE_REALTY'
      | 'STATE_INSURANCE'
      | 'OVERTURE'
      | 'CHAMBER',
    cadence: j.cadence,
    active: j.active,
    marketId: j.marketId,
    marketName: j.market.name,
    leadCount: j._count.leads,
    lastRunAt: j.lastRunAt?.toISOString() ?? null,
    filters: j.filters as Record<string, unknown> | null,
  }));

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="border-b border-card-border bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Scrape jobs</h1>
          <Pill color="#6366f1" tone="soft">
            Phase 8
          </Pill>
        </div>
        <p className="mt-1 text-[11px] text-gray-500 sm:text-xs">
          Recurring lead-ingestion jobs per market. Approved leads flow into Partners; pending leads
          land in <code className="rounded bg-gray-100 px-1">/admin/scraped-leads</code>.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <ScrapeJobsClient
            jobs={rows}
            markets={markets.map((m) => ({ id: m.id, name: m.name, timezone: m.timezone }))}
          />
        </div>
      </div>
    </div>
  );
}
