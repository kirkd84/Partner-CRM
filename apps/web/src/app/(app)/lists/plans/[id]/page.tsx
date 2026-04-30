/**
 * /lists/plans/[id] — multi-day plan overview.
 *
 * Lists each day in the plan with stop count, drive time, route
 * miles, and a link to the per-day detail at /lists/[id] which
 * carries the rest of the rep workflow (run view, mark-complete,
 * route map, etc.).
 */

import { auth } from '@/auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, MapPinned, Clock, Route } from 'lucide-react';
import { prisma } from '@partnerradar/db';
import { Card, Pill } from '@partnerradar/ui';
import { PlanActions } from './PlanActions';

export const dynamic = 'force-dynamic';

export default async function PlanDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { id } = await params;

  const plan = await prisma.hitListPlan.findUnique({
    where: { id },
    include: {
      market: { select: { id: true, name: true, timezone: true } },
      hitLists: {
        orderBy: { dayIndex: 'asc' },
        include: {
          stops: {
            select: { id: true, completedAt: true, skippedAt: true },
          },
        },
      },
    },
  });
  if (!plan) notFound();
  if (!session.user.markets.includes(plan.marketId)) notFound();
  const isOwner = plan.userId === session.user.id;
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  if (!isOwner && !isManagerPlus) notFound();

  const totalHours = (plan.totalMinutes / 60).toFixed(1);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href="/lists"
        className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> All hit lists
      </Link>
      <header className="mt-1 flex items-center gap-2">
        <MapPinned className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold text-gray-900">
          {plan.label || `Plan from ${plan.startAddress}`}
        </h1>
        <div className="ml-auto">
          <PlanActions planId={plan.id} />
        </div>
      </header>
      <p className="mt-1 text-xs text-gray-500">
        {plan.market.name} · Built {plan.generatedAt.toLocaleString()} ·{' '}
        {plan.endMode === 'END_AT_HOME' ? 'Returns home each night' : 'Ends at last stop'}
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Stat label="Days" value={plan.totalDays} />
        <Stat label="Stops" value={plan.totalStops} />
        <Stat label="Drive miles" value={`${plan.totalDistance.toFixed(1)} mi`} accent="amber" />
        <Stat label="Total time" value={`${totalHours} h`} accent="blue" />
      </div>

      <h2 className="mt-6 text-sm font-semibold text-gray-700">Days</h2>
      <div className="mt-2 space-y-3">
        {plan.hitLists.map((list) => {
          const completed = list.stops.filter((s) => s.completedAt).length;
          const total = list.stops.length;
          const dayLabel = list.date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          });
          const drive = list.totalDuration ?? 0;
          return (
            <Link
              key={list.id}
              href={`/lists/${list.id}`}
              className="group flex items-center gap-4 rounded-lg border border-card-border bg-white p-4 shadow-card transition hover:border-blue-200 hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-sm font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                {(list.dayIndex ?? 0) + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-gray-900">{dayLabel}</span>
                  <Pill tone="soft" color={completed === total ? 'emerald' : 'blue'}>
                    {total} stop{total === 1 ? '' : 's'}
                  </Pill>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {Math.round(drive / 60)} h drive
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Route className="h-3 w-3" /> {(list.totalDistance ?? 0).toFixed(1)} mi
                  </span>
                  <span>
                    {completed}/{total} done
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-primary" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: 'amber' | 'blue';
}) {
  const tone =
    accent === 'amber' ? 'text-amber-700' : accent === 'blue' ? 'text-blue-700' : 'text-gray-900';
  return (
    <div className="rounded-md border border-card-border bg-white px-3 py-2 shadow-card">
      <div className="text-[10.5px] uppercase tracking-label text-gray-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
