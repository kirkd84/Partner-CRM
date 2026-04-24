/**
 * Admin · Partner Reliability report.
 *
 * Ranks partners by the reliabilityScore the attendance postmortem
 * (EV-8) populates. Manager+ can see + export; admin can bulk-toggle
 * autoWaitlistEligible from the selection checkbox column.
 *
 * Filters: market, min acceptance rate, autoWaitlistEligible only.
 * Sort: by reliabilityScore desc (nulls last).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@partnerradar/db';
import { ReliabilityClient } from './ReliabilityClient';

export const dynamic = 'force-dynamic';

export default async function ReliabilityPage({
  searchParams,
}: {
  searchParams: Promise<{
    market?: string;
    eligible?: 'yes' | 'no';
    minRate?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const role = session.user.role;
  if (role !== 'ADMIN' && role !== 'MANAGER') redirect('/');

  const sp = await searchParams;

  const marketScope = role === 'ADMIN' ? {} : { marketId: { in: session.user.markets ?? [] } };
  const marketFilter = sp.market ? { marketId: sp.market } : {};
  const eligibleFilter =
    sp.eligible === 'yes'
      ? { autoWaitlistEligible: true }
      : sp.eligible === 'no'
        ? { autoWaitlistEligible: false }
        : {};
  const minRate = sp.minRate ? Number(sp.minRate) : null;
  const minRateFilter = minRate != null ? { eventShowRate: { gte: minRate } } : {};

  const [partners, markets] = await Promise.all([
    prisma.partner.findMany({
      where: {
        ...marketScope,
        ...marketFilter,
        ...eligibleFilter,
        ...minRateFilter,
        archivedAt: null,
      },
      select: {
        id: true,
        companyName: true,
        marketId: true,
        market: { select: { name: true } },
        autoWaitlistEligible: true,
        waitlistPriority: true,
        eventAcceptanceRate: true,
        eventShowRate: true,
        reliabilityScore: true,
        stage: true,
      },
      orderBy: [
        { reliabilityScore: { sort: 'desc', nulls: 'last' } },
        { eventShowRate: { sort: 'desc', nulls: 'last' } },
        { companyName: 'asc' },
      ],
      take: 250,
    }),
    prisma.market.findMany({
      where: role === 'ADMIN' ? {} : { id: { in: session.user.markets ?? [] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const rows = partners.map((p) => ({
    id: p.id,
    companyName: p.companyName,
    marketName: p.market.name,
    marketId: p.marketId,
    stage: p.stage,
    autoWaitlistEligible: p.autoWaitlistEligible,
    waitlistPriority: p.waitlistPriority,
    acceptanceRate: p.eventAcceptanceRate ?? null,
    showRate: p.eventShowRate ?? null,
    reliabilityScore: p.reliabilityScore ?? null,
  }));

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Partner reliability</h1>
            <p className="mt-1 text-xs text-gray-500">
              Ranked by 90-day event show rate + acceptance rate. Flip reliable partners onto the
              auto-waitlist to auto-invite when your primary queue drains.
            </p>
          </div>
          <Link
            href="/api/admin/reliability/export"
            className="ml-auto rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </Link>
        </div>
        <form className="mt-3 flex flex-wrap items-center gap-2 text-xs" method="get">
          <label className="flex items-center gap-1">
            Market
            <select
              name="market"
              defaultValue={sp.market ?? ''}
              className="rounded-md border border-gray-200 px-2 py-1"
            >
              <option value="">All</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Min show rate
            <input
              type="number"
              name="minRate"
              min={0}
              max={1}
              step={0.05}
              defaultValue={sp.minRate ?? ''}
              className="w-16 rounded-md border border-gray-200 px-2 py-1 tabular-nums"
              placeholder="e.g. 0.80"
            />
          </label>
          <label className="flex items-center gap-1">
            Eligible
            <select
              name="eligible"
              defaultValue={sp.eligible ?? ''}
              className="rounded-md border border-gray-200 px-2 py-1"
            >
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md border border-gray-300 bg-white px-3 py-1 font-semibold text-gray-700 hover:bg-gray-50"
          >
            Apply
          </button>
        </form>
      </header>

      <ReliabilityClient rows={rows} canBulkEdit={role === 'ADMIN'} />
    </div>
  );
}
