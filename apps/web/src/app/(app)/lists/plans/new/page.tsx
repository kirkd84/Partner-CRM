/**
 * /lists/plans/new — multi-day route plan builder.
 *
 * Pick a starting address, partner pool (closest-N to a location),
 * working-hours config, and the planner spits out a Mon/Tue/Wed
 * breakout with ETAs.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPinned } from 'lucide-react';
import { prisma } from '@partnerradar/db';
import { PlanBuilderClient } from './PlanBuilderClient';

export const dynamic = 'force-dynamic';

export default async function NewPlanPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const markets = await prisma.market.findMany({
    where: { id: { in: session.user.markets ?? [] } },
    select: {
      id: true,
      name: true,
      physicalAddress: true,
      defaultCenter: true,
      timezone: true,
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href="/lists"
        className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Back to hit lists
      </Link>
      <header className="mt-1 flex items-baseline gap-2">
        <MapPinned className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold text-gray-900">Plan a multi-day route</h1>
      </header>
      <p className="mt-1 text-xs text-gray-500">
        Drop a pin, tell us how many partners you want to hit, and we&apos;ll break the trip into
        days that fit your working hours — with ETAs, drive times, and any existing appointments
        folded in.
      </p>

      <PlanBuilderClient
        markets={markets.map((m) => ({
          id: m.id,
          name: m.name,
          address: m.physicalAddress ?? '',
          defaultCenter: m.defaultCenter as { lat: number; lng: number } | null,
        }))}
      />
    </div>
  );
}
