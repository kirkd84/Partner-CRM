import { Prisma, prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Card, Pill, EmptyState } from '@partnerradar/ui';
import { Inbox } from 'lucide-react';
import { ScrapedLeadsClient } from './ScrapedLeadsClient';

export const dynamic = 'force-dynamic';

type SearchParams = { source?: string; status?: string };

const SOURCE_LABELS: Record<string, string> = {
  GOOGLE_PLACES: 'Google Places',
  YELP: 'Yelp',
  LICENSING_BOARD: 'Licensing Board',
  CUSTOM_URL: 'Custom URL',
  NMLS: 'NMLS',
  STATE_REALTY: 'State Realty Board',
  STATE_INSURANCE: 'State Insurance Dept.',
  OVERTURE: 'Overture Maps',
  CHAMBER: 'Chamber of Commerce',
  STORM_CLOUD: 'Storm Cloud',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
  DUPLICATE: 'gray',
};

export default async function ScrapedLeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  if (!isManagerPlus) {
    return (
      <div className="p-6">
        <Card title="Managers only">
          <p className="text-sm text-gray-700">
            The prospect queue is where managers approve or reject scraper candidates before they
            become partners. Ask your admin if you think you should have access.
          </p>
        </Card>
      </div>
    );
  }
  const params = await searchParams;

  const where: Prisma.ScrapedLeadWhereInput = {
    marketId: { in: session.user.markets },
  };
  if (params.status) where.status = params.status as any;
  else where.status = 'PENDING';
  if (params.source) {
    where.scrapeJob = { source: params.source as any };
  }

  const [leads, counts, reps, markets] = await Promise.all([
    prisma.scrapedLead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        market: { select: { id: true, name: true } },
        scrapeJob: { select: { id: true, name: true, source: true } },
      },
    }),
    prisma.scrapedLead.groupBy({
      by: ['status'],
      where: { marketId: { in: session.user.markets } },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: {
        active: true,
        markets: { some: { marketId: { in: session.user.markets } } },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.market.findMany({
      where: { id: { in: session.user.markets } },
      select: { id: true, name: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<
    string,
    number
  >;

  return (
    <div className="p-6">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
          <Inbox className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Prospect queue</h1>
          <p className="text-xs text-gray-500">
            Candidate partners surfaced by the ingestion pipeline (NMLS, state licensing boards,
            Overture Maps, Google Places). Approve to turn into a Partner; reject to silence future
            re-surfaces.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="soft" color="yellow">
            {countByStatus.PENDING ?? 0} pending
          </Pill>
          <Pill tone="soft" color="green">
            {countByStatus.APPROVED ?? 0} approved
          </Pill>
          <Pill tone="soft" color="red">
            {countByStatus.REJECTED ?? 0} rejected
          </Pill>
        </div>
      </header>

      {leads.length === 0 ? (
        <div className="mt-6">
          <Card>
            <EmptyState
              title="No prospects to review"
              description="When the ingestion jobs run (NMLS weekly, state boards weekly, Overture on-demand, Google Places live-refresh), candidates land here."
            />
          </Card>
        </div>
      ) : (
        <ScrapedLeadsClient
          leads={leads.map((l) => ({
            id: l.id,
            createdAt: l.createdAt.toISOString(),
            status: l.status,
            source: l.scrapeJob.source,
            jobName: l.scrapeJob.name,
            marketName: l.market.name,
            normalized: l.normalized as Record<string, any>,
            sourceLabel: SOURCE_LABELS[l.scrapeJob.source] ?? l.scrapeJob.source,
            statusColor: STATUS_COLORS[l.status] ?? 'gray',
          }))}
          reps={reps}
          markets={markets}
          activeStatus={(params.status ?? 'PENDING') as string}
        />
      )}
    </div>
  );
}
