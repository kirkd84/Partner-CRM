import { Prisma, prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Card, StatusTile, StatCard, ActivityItem, Avatar } from '@partnerradar/ui';
import { ORDERED_STAGES, STAGE_COLORS, STAGE_LABELS } from '@partnerradar/types';
import { tenant } from '@partnerradar/config';
import { PhoneCall, Coffee, Sparkles, ArrowUpRight, LayoutGrid, Trophy } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function RadarPage() {
  const session = await auth();
  if (!session?.user) return null;
  const t = tenant();

  const partnerWhere: Prisma.PartnerWhereInput = {
    marketId: { in: session.user.markets },
    archivedAt: null,
  };
  if (session.user.role === 'REP') {
    partnerWhere.OR = [{ assignedRepId: session.user.id }, { assignedRepId: null }];
  }

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    byStage,
    activities,
    tasks,
    contactsMade,
    meetingsHeld,
    activated30d,
    stageChanges30d,
    leaderboardRows,
    repsMap,
  ] = await Promise.all([
    prisma.partner.groupBy({
      by: ['stage'],
      where: partnerWhere,
      _count: { stage: true },
    }),
    prisma.activity.findMany({
      where: { partner: partnerWhere },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        user: { select: { name: true, avatarColor: true } },
        partner: { select: { id: true, publicId: true, companyName: true } },
      },
    }),
    prisma.task.findMany({
      where: { assigneeId: session.user.id, completedAt: null },
      orderBy: { dueAt: 'asc' },
      take: 6,
    }),
    prisma.activity.count({
      where: {
        partner: partnerWhere,
        createdAt: { gte: since30 },
        type: { in: ['CALL', 'EMAIL_OUT', 'SMS_OUT', 'VISIT'] },
      },
    }),
    prisma.activity.count({
      where: { partner: partnerWhere, createdAt: { gte: since30 }, type: 'MEETING_HELD' },
    }),
    prisma.partner.count({
      where: { ...partnerWhere, activatedAt: { gte: since30 } },
    }),
    prisma.activity.count({
      where: { partner: partnerWhere, createdAt: { gte: since30 }, type: 'STAGE_CHANGE' },
    }),
    // Leaderboard — activity count per rep in last 30 days.
    // When Phase 5 Storm revenue sync lands, swap this for revenue attributed
    // per rep (sum of RevenueAttribution joined through Partner.assignedRepId).
    prisma.activity.groupBy({
      by: ['userId'],
      where: {
        partner: partnerWhere,
        createdAt: { gte: since30 },
      },
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 10,
    }),
    prisma.user.findMany({
      where: { markets: { some: { marketId: { in: session.user.markets } } } },
      select: { id: true, name: true, avatarColor: true, role: true },
    }),
  ]);

  const repsById = new Map(repsMap.map((r) => [r.id, r]));
  const leaderboard = leaderboardRows
    .map((row) => ({
      userId: row.userId,
      count: row._count.userId,
      user: repsById.get(row.userId),
    }))
    .filter((r) => r.user);

  const counts: Record<string, number> = {};
  for (const row of byStage) counts[row.stage] = row._count.stage;
  const pipelineTotal = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="grid h-[calc(100vh-52px)] grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
      {/* ── Left column: full-width sections stacked ──────────────────── */}
      <div className="space-y-5 overflow-y-auto border-r border-card-border p-5">
        {/* Header */}
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-gray-900">Radar</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {t.brandName} for {t.legalName} · {t.services.join(' · ').toLowerCase()}
          </p>
        </div>

        {/* Pipeline statuses */}
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-label text-gray-600">
            Pipeline Statuses
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {ORDERED_STAGES.map((stage) => (
              <StatusTile
                key={stage}
                label={STAGE_LABELS[stage]}
                count={counts[stage] ?? 0}
                color={STAGE_COLORS[stage]}
                href={`/partners?stage=${stage}`}
              />
            ))}
          </div>
        </section>

        {/* My open tasks — moved above 30-day stats per Storm layout */}
        <Card title="My open tasks">
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing on your plate. Plan a hit list.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{task.title}</div>
                    {task.dueAt && (
                      <div className="text-xs text-gray-500">
                        Due {new Date(task.dueAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <span className="text-xs uppercase tracking-label text-gray-400">
                    {task.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 30-Day Stats — now below tasks, each card has an icon */}
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-label text-gray-600">
            30-Day Stats
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
            <StatCard
              label="Contacts Made"
              value={contactsMade}
              icon={<PhoneCall className="h-3.5 w-3.5" />}
              iconColor="#3b82f6"
            />
            <StatCard
              label="Meetings Held"
              value={meetingsHeld}
              icon={<Coffee className="h-3.5 w-3.5" />}
              iconColor="#f59e0b"
            />
            <StatCard
              label="Partners Activated"
              value={activated30d}
              icon={<Sparkles className="h-3.5 w-3.5" />}
              iconColor="#10b981"
            />
            <StatCard
              label="Stage Advancements"
              value={stageChanges30d}
              icon={<ArrowUpRight className="h-3.5 w-3.5" />}
              iconColor="#a855f7"
            />
            <StatCard
              label="Pipeline Size"
              value={pipelineTotal}
              icon={<LayoutGrid className="h-3.5 w-3.5" />}
              iconColor="#6b7280"
              delta="all stages"
            />
          </div>
        </section>

        {/* Top Reps leaderboard */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-warning" />
              Top reps · last 30 days
            </span>
          }
        >
          {leaderboard.length === 0 ? (
            <p className="text-sm text-gray-500">No rep activity in the last 30 days yet.</p>
          ) : (
            <ol className="divide-y divide-gray-100">
              {leaderboard.map((row, idx) => (
                <li key={row.userId} className="flex items-center gap-3 py-2">
                  <div className="w-5 text-[13px] font-semibold tabular-nums text-gray-400">
                    {idx + 1}
                  </div>
                  <Avatar name={row.user!.name} color={row.user!.avatarColor} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {row.user!.name}
                    </div>
                    <div className="text-[11px] uppercase tracking-label text-gray-500">
                      {row.user!.role.toLowerCase()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-semibold tabular-nums text-gray-900">
                      {row.count}
                    </div>
                    <div className="text-[11px] text-gray-500">activities</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[11px] text-gray-400">
            Swapping to <span className="font-medium">revenue attributed</span> once Storm Cloud
            sync lands in Phase 5.
          </p>
        </Card>
      </div>

      {/* ── Right column: activity feed, full-height sticky ──────────── */}
      <aside className="hidden flex-col overflow-hidden bg-white lg:flex">
        <div className="flex items-center justify-between border-b border-card-border px-5 py-3">
          <h2 className="text-[13px] font-semibold text-gray-900">Live activity</h2>
          <span className="text-[10.5px] uppercase tracking-label text-gray-500">
            {activities.length} events
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          {activities.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">No activity yet.</p>
          ) : (
            activities.map((a) => (
              <ActivityItem
                key={a.id}
                userName={a.user.name}
                userColor={a.user.avatarColor}
                verb={verbFor(a.type)}
                partnerName={a.partner.companyName}
                partnerHref={`/partners/${a.partner.id}`}
                body={a.body ?? undefined}
                timestamp={timeago(a.createdAt)}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function verbFor(type: string): string {
  switch (type) {
    case 'COMMENT':
      return 'commented on';
    case 'CALL':
      return 'logged a call with';
    case 'SMS_OUT':
      return 'sent SMS to';
    case 'EMAIL_OUT':
      return 'emailed';
    case 'VISIT':
      return 'visited';
    case 'MEETING_HELD':
      return 'met with';
    case 'STAGE_CHANGE':
      return 'moved stage for';
    case 'ACTIVATION':
      return 'activated';
    case 'CLAIM':
      return 'claimed';
    default:
      return 'updated';
  }
}

function timeago(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
