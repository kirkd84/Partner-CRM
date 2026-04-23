import Link from 'next/link';
import { Prisma, prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Card, EmptyState, Pill } from '@partnerradar/ui';
import { MapPinned, CheckCircle2, Circle } from 'lucide-react';
import { HitListToolbar } from './HitListToolbar';

export const dynamic = 'force-dynamic';

export default async function ListsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';

  // REPs see only their own lists; managers+ see every list in their markets.
  const where: Prisma.HitListWhereInput = {
    marketId: { in: session.user.markets },
    ...(isManagerPlus ? {} : { userId: session.user.id }),
  };

  const [lists, markets] = await Promise.all([
    prisma.hitList.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, avatarColor: true } },
        market: { select: { name: true, timezone: true } },
        stops: {
          select: { id: true, completedAt: true, skippedAt: true },
        },
      },
    }),
    prisma.market.findMany({
      where: { id: { in: session.user.markets } },
      select: { id: true, name: true, address: true, timezone: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Hit Lists</h1>
          <p className="text-xs text-gray-500">
            Your planned partner visits by day. Build a list, drop in partners, knock them out.
          </p>
        </div>
        <div className="ml-auto">
          <HitListToolbar markets={markets} />
        </div>
      </header>

      <div className="mt-5">
        {lists.length === 0 ? (
          <Card>
            <EmptyState
              title="No hit lists yet"
              description={'Plan your day: pick a start address, then add partners to visit. Use "+ New hit list" above.'}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => {
              const completed = list.stops.filter((s) => s.completedAt).length;
              const total = list.stops.length;
              const pct = total ? Math.round((completed / total) * 100) : 0;
              const dateLabel = list.date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              });
              return (
                <Link
                  key={list.id}
                  href={`/lists/${list.id}`}
                  className="group rounded-lg border border-card-border bg-white p-4 shadow-card transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
                      <MapPinned className="h-4.5 w-4.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-gray-900">{dateLabel}</div>
                        <Pill tone="soft" color={pct === 100 ? 'green' : 'blue'}>
                          {completed}/{total} stops
                        </Pill>
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500 truncate">
                        {list.market.name} · Start: {list.startAddress}
                      </div>
                      {isManagerPlus && list.userId !== session.user.id && (
                        <div className="mt-0.5 text-[11px] text-gray-400">for {list.user.name}</div>
                      )}
                    </div>
                    <div className="text-right">
                      {pct === 100 ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-gray-300" />
                      )}
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="mt-3 h-1 w-full overflow-hidden rounded bg-gray-100">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
