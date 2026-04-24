/**
 * Activity tab — volume of rep-initiated actions in the window.
 *
 * Answers: what kinds of work are the reps doing, and how has the
 * volume trended? Groups activities by type for totals + by day for
 * the sparkline.
 */

import { prisma, Prisma, ActivityType } from '@partnerradar/db';
import { Card, StatCard } from '@partnerradar/ui';
import { PhoneCall, Mail, MessageSquare, Coffee, Navigation, ArrowUpRight } from 'lucide-react';
import { rangeToStart, type RangeId } from './RangePicker';

interface Props {
  range: RangeId;
  markets: string[];
  scopeAllMarkets: boolean;
}

const INCLUDED_TYPES: ActivityType[] = [
  'CALL',
  'EMAIL_OUT',
  'SMS_OUT',
  'VISIT',
  'MEETING_HELD',
  'STAGE_CHANGE',
];

export async function ActivityTab({ range, markets, scopeAllMarkets }: Props) {
  const since = rangeToStart(range);
  const partnerScope: Prisma.PartnerWhereInput = scopeAllMarkets
    ? { archivedAt: null }
    : { archivedAt: null, marketId: { in: markets } };

  const [byType, byDay, topRepsRows, reps] = await Promise.all([
    prisma.activity.groupBy({
      by: ['type'],
      where: {
        createdAt: { gte: since },
        partner: partnerScope,
        type: { in: INCLUDED_TYPES },
      },
      _count: { type: true },
    }),
    prisma.$queryRaw<Array<{ day: Date; cnt: bigint }>>`
      SELECT date_trunc('day', a."createdAt") AS day, COUNT(*)::bigint AS cnt
      FROM "Activity" a
      INNER JOIN "Partner" p ON p.id = a."partnerId"
      WHERE a."createdAt" >= ${since}
        AND a.type = ANY(ARRAY['CALL','EMAIL_OUT','SMS_OUT','VISIT','MEETING_HELD','STAGE_CHANGE']::"ActivityType"[])
        AND p."archivedAt" IS NULL
        ${scopeAllMarkets ? Prisma.sql`` : Prisma.sql`AND p."marketId" = ANY(${markets})`}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.activity.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: since },
        partner: partnerScope,
        type: { in: INCLUDED_TYPES },
      },
      _count: { userId: true },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, avatarColor: true, role: true },
    }),
  ]);

  const repById = new Map(reps.map((r) => [r.id, r]));
  const counts: Record<string, number> = {};
  for (const row of byType) counts[row.type] = row._count.type;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const topReps = topRepsRows
    .map((row) => ({
      user: repById.get(row.userId),
      count: row._count.userId,
    }))
    .filter((r) => r.user)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const days = byDay.map((d) => ({ day: d.day, cnt: Number(d.cnt) }));
  const maxCnt = Math.max(1, ...days.map((d) => d.cnt));

  return (
    <div className="space-y-5 p-6">
      <section>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-label text-gray-600">
          Activity by type
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Calls"
            value={counts.CALL ?? 0}
            icon={<PhoneCall className="h-3.5 w-3.5" />}
            iconColor="#3b82f6"
          />
          <StatCard
            label="Emails sent"
            value={counts.EMAIL_OUT ?? 0}
            icon={<Mail className="h-3.5 w-3.5" />}
            iconColor="#6366f1"
          />
          <StatCard
            label="SMS sent"
            value={counts.SMS_OUT ?? 0}
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            iconColor="#0ea5e9"
          />
          <StatCard
            label="Visits"
            value={counts.VISIT ?? 0}
            icon={<Navigation className="h-3.5 w-3.5" />}
            iconColor="#10b981"
          />
          <StatCard
            label="Meetings"
            value={counts.MEETING_HELD ?? 0}
            icon={<Coffee className="h-3.5 w-3.5" />}
            iconColor="#f59e0b"
          />
          <StatCard
            label="Stage moves"
            value={counts.STAGE_CHANGE ?? 0}
            icon={<ArrowUpRight className="h-3.5 w-3.5" />}
            iconColor="#a855f7"
          />
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          {total.toLocaleString()} total activities in the window.
        </p>
      </section>

      <Card title="Daily volume">
        {days.length === 0 ? (
          <p className="text-sm text-gray-500">No activity in this window.</p>
        ) : (
          <div className="flex h-32 items-end gap-0.5">
            {days.map((d) => (
              <div
                key={d.day.toISOString()}
                title={`${d.day.toLocaleDateString()}: ${d.cnt}`}
                className="flex-1 rounded-t bg-primary/60"
                style={{ height: `${(d.cnt / maxCnt) * 100}%`, minHeight: '2px' }}
              />
            ))}
          </div>
        )}
      </Card>

      <Card title="Most active reps">
        {topReps.length === 0 ? (
          <p className="text-sm text-gray-500">No rep activity in this window.</p>
        ) : (
          <ol className="divide-y divide-gray-100">
            {topReps.map((row, idx) => (
              <li key={row.user!.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-right text-[12px] font-semibold text-gray-400">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{row.user!.name}</span>
                  <span className="text-[11px] uppercase tracking-label text-gray-500">
                    {row.user!.role.toLowerCase()}
                  </span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {row.count}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
