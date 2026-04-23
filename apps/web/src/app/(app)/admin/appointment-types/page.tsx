import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Table, THead, TBody, TR, TH, TD, Pill } from '@partnerradar/ui';
import { CalendarClock } from 'lucide-react';
import { AppointmentTypesToolbar, AppointmentTypeRowActions } from './AppointmentTypesClient';

export const dynamic = 'force-dynamic';

export default async function AdminAppointmentTypesPage() {
  const session = await auth();
  if (!session?.user) return null;

  // Manager+ for the whole page (actions double-check). Admins already
  // have every market; managers see the shared tenant-wide catalog.
  let types: Awaited<ReturnType<typeof prisma.appointmentType.findMany>> = [];
  try {
    types = await prisma.appointmentType.findMany({
      orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
      include: { alertUser: { select: { id: true, name: true } } },
    });
  } catch {
    // Table doesn't exist yet (pre-prisma:push). Fall through to empty list.
    types = [];
  }

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });

  const activeCount = types.filter((t) => !t.archivedAt).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Appointment types</h1>
          <p className="text-xs text-gray-500">
            {activeCount} active · {types.length - activeCount} archived · shared across the tenant
          </p>
        </div>
        <div className="ml-auto">
          <AppointmentTypesToolbar users={users} />
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-white">
        {types.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-gray-300" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No appointment types yet</h3>
            <p className="text-xs text-gray-500">
              Click "+ New type" to define the first one (e.g. Initial Inspection, Pitch, Coffee…).
            </p>
            <p className="mt-3 text-[11px] text-gray-400">
              If you're expecting types here, run{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">
                pnpm --filter @partnerradar/db prisma:push
              </code>{' '}
              against Railway Postgres so the new table exists, then reload.
            </p>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Duration</TH>
                <TH>Reminder</TH>
                <TH>Unassigned alert</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {types.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <span className="font-medium text-gray-900">{t.name}</span>
                  </TD>
                  <TD>
                    <span className="text-xs text-gray-700">
                      {formatDuration(t.durationMinutes)}
                    </span>
                  </TD>
                  <TD>
                    {t.reminderMinutesBefore === null ? (
                      <span className="text-xs text-gray-400">None</span>
                    ) : (
                      <span className="text-xs text-gray-700">
                        {formatReminder(t.reminderMinutesBefore)}
                      </span>
                    )}
                  </TD>
                  <TD>
                    {t.alertIfUnassigned ? (
                      t.alertUser ? (
                        <Pill color="#f59e0b" tone="soft">
                          Alert {t.alertUser.name}
                        </Pill>
                      ) : (
                        <Pill color="#ef4444" tone="soft">
                          Alert (no user set)
                        </Pill>
                      )
                    ) : (
                      <span className="text-xs text-gray-400">Off</span>
                    )}
                  </TD>
                  <TD>
                    {t.archivedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-300" /> Archived
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Active
                      </span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <AppointmentTypeRowActions
                      type={{
                        id: t.id,
                        name: t.name,
                        durationMinutes: t.durationMinutes,
                        reminderMinutesBefore: t.reminderMinutesBefore,
                        alertIfUnassigned: t.alertIfUnassigned,
                        alertUserId: t.alertUserId,
                        archived: Boolean(t.archivedAt),
                      }}
                      users={users}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`;
}

function formatReminder(min: number): string {
  if (min === 0) return 'At start time';
  if (min < 60) return `${min} min before`;
  if (min % 1440 === 0) return `${min / 1440} day before`;
  if (min % 60 === 0) return `${min / 60} hr before`;
  return `${min} min before`;
}
