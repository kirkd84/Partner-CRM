import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Card, StatusTile, ActivityItem } from '@partnerradar/ui';
import { ORDERED_STAGES, STAGE_COLORS, STAGE_LABELS } from '@partnerradar/types';
import { tenant } from '@partnerradar/config';

export const dynamic = 'force-dynamic';

export default async function RadarPage() {
  const session = await auth();
  if (!session?.user) return null;
  const t = tenant();

  const userMarkets = session.user.markets;
  const baseWhere = {
    marketId: { in: userMarkets },
    archivedAt: null,
    ...(session.user.role === 'REP'
      ? { OR: [{ assignedRepId: session.user.id }, { assignedRepId: null }] }
      : {}),
  } as const;

  const [byStage, activities, tasks] = await Promise.all([
    prisma.partner.groupBy({
      by: ['stage'],
      where: baseWhere,
      _count: { stage: true },
    }),
    prisma.activity.findMany({
      where: { partner: baseWhere },
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
  ]);

  const counts: Record<string, number> = Object.fromEntries(
    byStage.map((b) => [b.stage, b._count.stage]),
  );

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Radar</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {t.brandName} for {t.legalName} · roofing · solar · gutters
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        <Card title="My open tasks">
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing on your plate. Plan a hit list.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tasks.map((t) => (
                <li key={t.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{t.title}</div>
                    {t.dueAt && (
                      <div className="text-xs text-gray-500">
                        Due {new Date(t.dueAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 uppercase">{t.priority}</span>
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
