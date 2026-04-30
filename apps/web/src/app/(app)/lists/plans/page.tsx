/**
 * /lists/plans — index of every multi-day plan the user has built.
 *
 * Reps see only their own plans; manager+ sees every plan in their
 * scoped markets so they can review what their team is up to.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma, type Prisma } from '@partnerradar/db';
import { Card, EmptyState, Pill } from '@partnerradar/ui';
import { ArrowLeft, MapPinned, ArrowRight, Plus, Clock, Route } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PlansIndexPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';

  const where: Prisma.HitListPlanWhereInput = isManagerPlus
    ? { marketId: { in: session.user.markets } }
    : { userId: session.user.id, marketId: { in: session.user.markets } };

  const plans = await prisma.hitListPlan
    .findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true } },
        market: { select: { name: true } },
      },
    })
    .catch(() => []);

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <Link
        href="/lists"
        className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> All hit lists
      </Link>
      <header className="mt-1 flex items-baseline gap-3">
        <MapPinned className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Multi-day plans</h1>
          <p className="text-xs text-gray-500">
            Trips broken into day-by-day routes — built by the planner with closest-N partners,
            working hours, and lunch carve-outs.
          </p>
        </div>
        <Link
          href="/lists/plans/new"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
        >
          <Plus className="h-3.5 w-3.5" /> New plan
        </Link>
      </header>

      <div className="mt-5">
        {plans.length === 0 ? (
          <Card>
            <EmptyState
              title="No plans yet"
              description="Build your first multi-day route — pick a start address, a partner pool, and the planner spreads them across days."
            />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => {
              const totalHours = (p.totalMinutes / 60).toFixed(1);
              return (
                <Link
                  key={p.id}
                  href={`/lists/plans/${p.id}`}
                  className="group flex flex-col gap-2 rounded-lg border border-card-border bg-white p-4 shadow-card transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-gray-900">
                      {p.label || `Plan from ${p.startAddress.slice(0, 28)}`}
                    </span>
                    <Pill tone="soft" color="blue">
                      {p.totalDays}d
                    </Pill>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                    <span>{p.totalStops} stops</span>
                    <span className="inline-flex items-center gap-1">
                      <Route className="h-3 w-3 text-amber-500" />
                      {p.totalDistance.toFixed(1)} mi
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 text-blue-500" />
                      {totalHours} h
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>
                      {p.market.name}
                      {isManagerPlus && p.userId !== session.user.id && ` · ${p.user.name}`}
                    </span>
                    <span className="inline-flex items-center gap-1 group-hover:text-primary">
                      Open <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="text-[10.5px] text-gray-400">
                    Built {p.generatedAt.toLocaleDateString()}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
