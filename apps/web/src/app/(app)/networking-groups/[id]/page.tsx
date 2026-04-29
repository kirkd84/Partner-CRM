/**
 * /networking-groups/[id] — group detail.
 *
 * Three things on this page:
 *   1. Header + summary (members, meetings YTD, spend YTD)
 *   2. Roster — partners in this group, with a 'Best partners' rank
 *      pulled from activity volume + revenue attribution
 *   3. Meeting log — every time a rep attended a meeting of this group
 *
 * "Best partners in this group" is computed at request-time: rank each
 * member by (revenue YTD + activity count YTD * 50). Cheap, deterministic,
 * adjustable later without a schema change.
 */

import { auth } from '@/auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Card, Pill } from '@partnerradar/ui';
import { ArrowLeft, ExternalLink, Trophy, Users2 } from 'lucide-react';
import { activeTenantId } from '@/lib/tenant/context';
import { GroupDetailClient } from './GroupDetailClient';

export const dynamic = 'force-dynamic';

export default async function NetworkingGroupDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { id } = await params;

  const tenantId = await activeTenantId(session);
  const group = await prisma.networkingGroup.findFirst({
    where: { id, ...(tenantId ? { tenantId } : {}) },
    include: {
      memberships: {
        where: { leftAt: null },
        orderBy: { joinedAt: 'desc' },
        include: {
          partner: {
            select: {
              id: true,
              publicId: true,
              companyName: true,
              partnerType: true,
              stage: true,
              isCustomer: true,
            },
          },
        },
      },
      meetings: {
        orderBy: { occurredOn: 'desc' },
        take: 50,
        include: {
          user: { select: { id: true, name: true } },
        },
      },
      market: { select: { id: true, name: true } },
    },
  });
  if (!group) notFound();

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const memberPartnerIds = group.memberships.map((m) => m.partnerId);

  // Best-partners ranking — revenue YTD + activity-count YTD * 50.
  const [revenueRows, activityRows, expensesYtd] = await Promise.all([
    memberPartnerIds.length
      ? prisma.revenueAttribution.groupBy({
          by: ['partnerId'],
          where: {
            partnerId: { in: memberPartnerIds },
            earnedOn: { gte: yearStart },
          },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    memberPartnerIds.length
      ? prisma.activity.groupBy({
          by: ['partnerId'],
          where: {
            partnerId: { in: memberPartnerIds },
            createdAt: { gte: yearStart },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.expense.aggregate({
      where: {
        networkingGroupId: id,
        occurredOn: { gte: yearStart },
        approvalStatus: { not: 'REJECTED' },
      },
      _sum: { amount: true },
    }),
  ]);

  const revenueByPartner = new Map<string, number>();
  for (const r of revenueRows) revenueByPartner.set(r.partnerId, Number(r._sum?.amount ?? 0));
  const activityByPartner = new Map<string, number>();
  for (const a of activityRows) activityByPartner.set(a.partnerId, a._count._all);

  const ranked = group.memberships
    .map((m) => {
      const rev = revenueByPartner.get(m.partner.id) ?? 0;
      const act = activityByPartner.get(m.partner.id) ?? 0;
      const score = rev + act * 50;
      return { ...m, revenue: rev, activity: act, score };
    })
    .sort((a, b) => b.score - a.score);

  const meetingSpend = group.meetings.reduce((sum, m) => sum + (m.spendCents ?? 0) / 100, 0);
  const expenseSpend = Number(expensesYtd._sum?.amount ?? 0);
  const totalSpend = meetingSpend + expenseSpend;
  const ytdMeetings = group.meetings.filter((m) => m.occurredOn >= yearStart).length;

  return (
    <div className="p-6">
      <Link
        href="/networking-groups"
        className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Back to networking groups
      </Link>

      <header className="mt-1 flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 font-semibold text-primary ring-1 ring-inset ring-blue-100">
          {(group.shortCode || group.name).slice(0, 3).toUpperCase()}
        </span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">{group.name}</h1>
          <p className="text-xs text-gray-500">
            {group.meetingCadence ?? 'No cadence set'}
            {group.market ? ` · ${group.market.name}` : ''}
          </p>
        </div>
        {group.websiteUrl && (
          <a
            href={group.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="h-3 w-3" /> Website
          </a>
        )}
      </header>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Stat
          label="Active members"
          value={`${group.memberships.length}`}
          icon={<Users2 className="h-3.5 w-3.5" />}
        />
        <Stat label="Meetings YTD" value={`${ytdMeetings}`} />
        <Stat
          label="Spend YTD"
          value={`$${formatMoney(totalSpend)}`}
          hint={`${formatMoney(meetingSpend)} meeting + ${formatMoney(expenseSpend)} expenses`}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="Best partners in this group">
          {ranked.length === 0 ? (
            <p className="text-xs text-gray-500">
              No active members yet. Add partners below — once they have activity or revenue, the
              top of this list shows you which relationships are paying off.
            </p>
          ) : (
            <ol className="divide-y divide-gray-100">
              {ranked.slice(0, 12).map((m, idx) => (
                <li key={m.partner.id} className="flex items-center gap-3 py-2 text-sm">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                      idx === 0
                        ? 'bg-amber-100 text-amber-800'
                        : idx === 1
                          ? 'bg-gray-100 text-gray-700'
                          : idx === 2
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-50 text-gray-500'
                    }`}
                  >
                    {idx === 0 ? <Trophy className="h-3 w-3" /> : idx + 1}
                  </span>
                  <Link
                    href={`/partners/${m.partner.id}`}
                    className="min-w-0 flex-1 truncate font-medium text-gray-900 hover:text-primary"
                  >
                    {m.partner.companyName}
                  </Link>
                  {m.partner.isCustomer && (
                    <Pill tone="soft" color="amber">
                      customer
                    </Pill>
                  )}
                  <div className="text-right text-[11px] tabular-nums text-gray-500">
                    {m.revenue > 0 && <div>${formatMoney(m.revenue)} rev</div>}
                    <div>{m.activity} touchpoints</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[10.5px] text-gray-400">
            Score = revenue YTD + activity-count YTD × 50. Tweakable later if it doesn&apos;t
            reflect the right "good partner" definition.
          </p>
        </Card>

        <GroupDetailClient
          groupId={group.id}
          members={group.memberships.map((m) => ({
            partnerId: m.partner.id,
            publicId: m.partner.publicId,
            companyName: m.partner.companyName,
            role: m.role,
          }))}
          meetings={group.meetings.map((m) => ({
            id: m.id,
            occurredOn: m.occurredOn.toISOString(),
            topic: m.topic,
            attendeesNote: m.attendeesNote,
            notes: m.notes,
            spendCents: m.spendCents,
            userName: m.user?.name ?? 'Unknown',
          }))}
          notes={group.notes}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-card-border bg-white px-3 py-2 shadow-card">
      <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-label text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{value}</div>
      {hint && <div className="text-[10.5px] text-gray-500">{hint}</div>}
    </div>
  );
}

function formatMoney(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}
