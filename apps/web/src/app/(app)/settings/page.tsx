import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Card } from '@partnerradar/ui';
import { redirect } from 'next/navigation';
import { SettingsForm } from './SettingsForm';
import { PasswordForm } from './PasswordForm';
import { CalendarConnections } from './CalendarConnections';
import { listCalendarProviders } from '@partnerradar/integrations';

export const dynamic = 'force-dynamic';

type NotificationPrefs = {
  taskDue?: boolean;
  stageChange?: boolean;
  activation?: boolean;
  mentionInComment?: boolean;
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      avatarColor: true,
      role: true,
      homeAddress: true,
      officeAddress: true,
      defaultStart: true,
      preferredMapApp: true,
      soundEffects: true,
      notificationPrefs: true,
      passwordHash: true,
    },
  });
  if (!user) redirect('/login');

  const prefs = (user.notificationPrefs ?? {}) as NotificationPrefs;
  const providers = listCalendarProviders();

  // Pull this rep's existing calendar connections (if any). Graceful if
  // the table hasn't been migrated yet.
  type Conn = {
    id: string;
    provider: string;
    externalAccountId: string;
    lastSyncedAt: Date | null;
    syncStatus: string;
    syncError: string | null;
  };
  let connections: Conn[] = [];
  try {
    connections = await prisma.calendarConnection.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        provider: true,
        externalAccountId: true,
        lastSyncedAt: true,
        syncStatus: true,
        syncError: true,
      },
      orderBy: { provider: 'asc' },
    });
  } catch {
    /* pre-migration, ignore */
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-xs text-gray-500">
          Profile, defaults, and notifications for {user.email}
        </p>
      </header>

      <Card title="Profile">
        <SettingsForm
          initial={{
            name: user.name,
            avatarColor: user.avatarColor,
            homeAddress: user.homeAddress ?? '',
            officeAddress: user.officeAddress ?? '',
            defaultStart: user.defaultStart,
            preferredMapApp: user.preferredMapApp,
            soundEffects: user.soundEffects,
            notificationPrefs: {
              taskDue: prefs.taskDue ?? true,
              stageChange: prefs.stageChange ?? true,
              activation: prefs.activation ?? true,
              mentionInComment: prefs.mentionInComment ?? true,
            },
          }}
        />
      </Card>

      {user.passwordHash && (
        <Card title="Password">
          <PasswordForm />
        </Card>
      )}

      <Card title="Calendar connections">
        <p className="mb-3 text-xs text-gray-500">
          Connect your work calendars so external events show up on /calendar and conflict with new
          appointments. Tokens are encrypted at rest (AES-256-GCM).
        </p>
        <CalendarConnections providers={providers} connections={connections} />
      </Card>

      <Card title="Account">
        <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
          <dt className="text-[11px] uppercase tracking-label text-gray-500">Email</dt>
          <dd className="text-gray-900">{user.email}</dd>
          <dt className="text-[11px] uppercase tracking-label text-gray-500">Role</dt>
          <dd className="text-gray-900">{user.role}</dd>
          <dt className="text-[11px] uppercase tracking-label text-gray-500">User ID</dt>
          <dd className="font-mono text-xs text-gray-500">{user.id}</dd>
        </dl>
        <p className="mt-3 text-[11px] text-gray-400">
          To change your email or role, ask an admin.
        </p>
      </Card>
    </div>
  );
}
