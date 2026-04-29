/**
 * /networking-groups — directory of all networking orgs Roof Tech is
 * tracking. Lists each group with member count, meetings YTD, spend
 * YTD, and a "best partners" peek. Click into a group for the detail
 * view.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, EmptyState, Pill } from '@partnerradar/ui';
import { Users2, ArrowRight, ExternalLink } from 'lucide-react';
import { prisma } from '@partnerradar/db';
import { activeTenantId } from '@/lib/tenant/context';
import { NewNetworkingGroupButton } from './NewNetworkingGroupButton';

export const dynamic = 'force-dynamic';

export default async function NetworkingGroupsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const tenantId = await activeTenantId(session);
  const isManagerPlus =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';

  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const groups = await prisma.networkingGroup
    .findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        archivedAt: null,
      },
      orderBy: [{ name: 'asc' }],
      include: {
        _count: { select: { memberships: true } },
        meetings: {
          where: { occurredOn: { gte: yearStart } },
          select: { id: true, spendCents: true },
        },
        expenses: {
          where: {
            occurredOn: { gte: yearStart },
            approvalStatus: { not: 'REJECTED' },
          },
          select: { amount: true },
        },
        memberships: {
          where: { leftAt: null },
          take: 4,
          orderBy: { joinedAt: 'desc' },
          select: {
            partner: {
              select: { id: true, publicId: true, companyName: true },
            },
          },
        },
      },
    })
    .catch(() => []);

  return (
    <div className="p-6">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
          <Users2 className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Networking groups</h1>
          <p className="text-xs text-gray-500">
            Organizations Roof Tech is part of — CAI, BNI, Chamber, REIA, etc. Track the meetings,
            members, spend, and which partners come from which group so you know which dues are
            paying off.
          </p>
        </div>
        {isManagerPlus && <NewNetworkingGroupButton />}
      </header>

      {groups.length === 0 ? (
        <div className="mt-6">
          <Card>
            <EmptyState
              title="No networking groups yet"
              description={
                isManagerPlus
                  ? 'Click New group to add the first one (BNI Chapter 47, Aurora Chamber, CAI of Colorado, …).'
                  : 'Ask your manager to add the groups your team belongs to.'
              }
            />
          </Card>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {groups.map((g) => {
            const meetingCount = g.meetings.length;
            const meetingSpendDollars = g.meetings.reduce(
              (sum, m) => sum + (m.spendCents ?? 0) / 100,
              0,
            );
            const expenseSpendDollars = g.expenses.reduce(
              (sum, e) => sum + Number(e.amount ?? 0),
              0,
            );
            const totalSpend = meetingSpendDollars + expenseSpendDollars;
            return (
              <Link
                key={g.id}
                href={`/networking-groups/${g.id}`}
                className="group flex flex-col rounded-lg border border-card-border bg-white p-4 shadow-card transition hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-primary ring-1 ring-inset ring-blue-100">
                    {(g.shortCode || g.name).slice(0, 3).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-gray-900">{g.name}</h2>
                    <p className="truncate text-[11px] text-gray-500">
                      {g.meetingCadence ?? 'No cadence set'}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <Stat label="Members" value={`${g._count.memberships}`} />
                  <Stat label="Meetings YTD" value={`${meetingCount}`} />
                  <Stat label="Spend YTD" value={`$${formatMoney(totalSpend)}`} />
                </div>
                {g.memberships.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
                      Recent partners
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {g.memberships.slice(0, 4).map((m) => (
                        <Pill key={m.partner.id} tone="soft" color="gray">
                          {m.partner.companyName}
                        </Pill>
                      ))}
                    </div>
                  </div>
                )}
                {g.websiteUrl && (
                  <div className="mt-2 flex items-center gap-1 text-[10.5px] text-gray-400">
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate">{g.websiteUrl}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5">
      <div className="text-[10.5px] uppercase tracking-label text-gray-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-gray-900">{value}</div>
    </div>
  );
}

function formatMoney(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}
