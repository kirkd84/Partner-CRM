/**
 * Phase 9: hit-list run view. Mobile-first single-stop card with
 * Navigate / Mark visited / Skip. Loads the next pending stop and
 * shows the queue beneath. "Re-plan from here" calls the optimizer
 * with the rep's current location.
 *
 * Server-rendered for the initial paint so the rep gets a fast first
 * stop card even on flaky cellular; the client island handles
 * geolocation + interaction.
 */

import Link from 'next/link';
import { auth } from '@/auth';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { ArrowLeft } from 'lucide-react';
import { RunStopList } from './RunStopList';

export const dynamic = 'force-dynamic';

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { id } = await params;

  const list = await prisma.hitList.findUnique({
    where: { id },
    include: {
      stops: {
        orderBy: { order: 'asc' },
        include: {
          partner: {
            select: {
              id: true,
              companyName: true,
              address: true,
              city: true,
              state: true,
              zip: true,
              lat: true,
              lng: true,
              partnerType: true,
              notes: true,
            },
          },
        },
      },
    },
  });
  if (!list) notFound();

  // Access gate: rep can run only their own lists; manager+ can view any
  // list in their markets.
  if (session.user.role === 'REP' && list.userId !== session.user.id) redirect('/lists');
  if (session.user.role === 'MANAGER') {
    const markets = session.user.markets ?? [];
    if (!markets.includes(list.marketId)) redirect('/lists');
  }

  const stops = list.stops.map((s) => ({
    id: s.id,
    order: s.order,
    plannedArrival: s.plannedArrival.toISOString(),
    plannedDurationMin: s.plannedDurationMin,
    isAppointmentLock: s.isAppointmentLock,
    distanceFromPrevMi: s.distanceFromPrevMi,
    durationFromPrevMin: s.durationFromPrevMin,
    arrivalEta: s.arrivalEta?.toISOString() ?? null,
    completedAt: s.completedAt?.toISOString() ?? null,
    skippedAt: s.skippedAt?.toISOString() ?? null,
    skipReason: s.skipReason ?? null,
    partner: {
      id: s.partner.id,
      companyName: s.partner.companyName,
      address: s.partner.address ?? '',
      city: s.partner.city ?? '',
      state: s.partner.state ?? '',
      zip: s.partner.zip ?? '',
      lat: s.partner.lat ?? null,
      lng: s.partner.lng ?? null,
      partnerType: s.partner.partnerType,
      notes: s.partner.notes ?? null,
    },
  }));

  const completed = stops.filter((s) => s.completedAt).length;
  const skipped = stops.filter((s) => s.skippedAt).length;
  const remaining = stops.length - completed - skipped;

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-card-border bg-white px-4 py-3 sm:px-6">
        <Link
          href={`/lists/${list.id}`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
          aria-label="Back to list"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-gray-900 sm:text-base">
            Today&apos;s route
          </h1>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-gray-500">
            <span>{remaining} to go</span>
            <span>·</span>
            <span>{completed} done</span>
            {skipped > 0 && (
              <>
                <span>·</span>
                <span>{skipped} skipped</span>
              </>
            )}
            {list.totalDistance != null && (
              <>
                <span>·</span>
                <span>{list.totalDistance.toFixed(1)} mi</span>
              </>
            )}
          </div>
        </div>
      </header>

      <RunStopList listId={list.id} stops={stops} />
    </div>
  );
}
