/**
 * Server component — renders the event activity log.
 * Separate from PartnerRadar Activity — this is EvActivityLogEntry,
 * scoped to one event.
 */

import { prisma } from '@partnerradar/db';

export async function ActivityTab({ eventId }: { eventId: string }) {
  const rows = await prisma.evActivityLogEntry
    .findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    .catch(() => []);

  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean) as string[])];
  const users =
    userIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, avatarColor: true },
        });
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl rounded-lg border border-card-border bg-white">
        <header className="border-b border-card-border px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Activity log</h2>
          <p className="text-[11px] text-gray-500">
            Everything this event has been through — create, edits, invites, cascade events.
          </p>
        </header>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500">No activity yet.</div>
        ) : (
          <ol className="divide-y divide-gray-100">
            {rows.map((r) => {
              const u = r.userId ? userById.get(r.userId) : null;
              return (
                <li
                  key={r.id}
                  className="grid grid-cols-[160px_90px_1fr] items-start gap-3 px-4 py-2.5"
                >
                  <div className="text-[11px] text-gray-500">{r.createdAt.toLocaleString()}</div>
                  <div className="font-mono text-[11px] text-gray-400">{r.kind}</div>
                  <div className="text-xs text-gray-800">
                    <span className="font-medium">{u?.name ?? 'System'}</span> · {r.summary}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
