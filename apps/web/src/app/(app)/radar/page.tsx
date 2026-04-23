import { Prisma, prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Card, StatusTile, StatCard, ActivityItem } from '@partnerradar/ui';
import { ORDERED_STAGES, STAGE_COLORS, STAGE_LABELS } from '@partnerradar/types';
import { tenant } from '@partnerradar/config';

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

  const [byStage, activities, tasks, contactsMade, meetingsHeld, activated30d, stageChanges30d] =
    await Promise.all([
      prisma.partner.groupBy({
        by: ['stage'],
        where: partnerWhere,
        _count: { stage: true },
      }),
      prisma.activity.findMany({
        where: { partner: partnerWhere },
        orderBy: { createdAt: 'desc' },
        take: 15,
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
      // 30-day stats
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
    ]);

  const counts: Record<string, number> = {};
  for (const row of byStage) counts[row.stage] = row._count.stage;
  const pipelineTotal = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-gray-900">Radar</h1>
        <p className="mt-0.5 text-xs text-gray-500">
          {t.brandName} for {t.legalName} · {t.services.join(' · ').toLowerCase()}
        </p>
      </div>

      {/* Pipeline status tiles */}
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

      {/* 30-day stats row */}
      <section>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-label text-gray-600">
          30-Day Stats
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
          <StatCard label="Contacts Made" value={contactsMade} />
          <StatCard label="Meetings Held" value={meetingsHeld} />
          <StatCard label="Partners Activated" value={activated30d} />
          <StatCard label="Stage Advancements" value={stageChanges30d} />
          <StatCard label="Pipeline Size" value={pipelineTotal} delta="all stages" />
        </div>
      </section>

      {/* Bottom split: tasks + live activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]">
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

        <Card title="Live activity">
          {activities.length === 0 ? (
            <p className="text-sm text-gray-500">No activity yet.</p>
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
        </Card>
      </div>
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
