import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Card } from '@partnerradar/ui';
import { redirect } from 'next/navigation';
import { SettingsForm } from './SettingsForm';
import { PasswordForm } from './PasswordForm';
import { CalendarConnections } from './CalendarConnections';
import { listCalendarProviders } from '@partnerradar/integrations';
import { isAIConfigured } from '@partnerradar/ai';
import { ToneCard } from '../tone-training/ToneCard';

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
      aiToneTrainingStatus: true,
      aiToneProfile: true,
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
    // Outer flex column fills the viewport; inner body scrolls
    // independently so we're not trapped under the top nav when the
    // content grows past the fold.
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-xs text-gray-500">
          Profile, defaults, and notifications for {user.email}
        </p>
      </header>

      {/* scroll region */}
      <div className="flex-1 overflow-y-auto p-6 pb-12">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-5 lg:grid-cols-2">
          {/* LEFT column — profile-level settings */}
          <div className="space-y-5">
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

          {/* RIGHT column — integrations (calendar now, more to come).
              No sticky positioning so the top edge aligns with Profile
              on the left, and the column fills the full 50% width. */}
          <div className="space-y-5">
            <Card title="AI tone">
              <ToneCard
                repName={user.name}
                status={user.aiToneTrainingStatus}
                summary={summarizeTone(user.aiToneProfile)}
                aiConfigured={isAIConfigured()}
              />
            </Card>

            <Card title="Calendar connections">
              <p className="mb-3 text-xs text-gray-500">
                Connect your Google, Microsoft 365, or Apple calendar so your existing events show
                up on your Partner Portal calendar. Only you can see the events from your calendars
                — your connection is private to your account.
              </p>
              <CalendarConnections providers={providers} connections={connections} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact one-liner for the ToneCard summary. Mirrors the shape used in
 * tone-training/actions.ts so the rep sees the same phrasing regardless
 * of whether they land here or the first-login modal.
 */
function summarizeTone(profile: unknown): string | null {
  if (!profile || typeof profile !== 'object') return null;
  const p = profile as {
    formality?: number;
    preferredLength?: string;
    emojiRate?: number;
    avgSentenceLength?: number;
    quirks?: string[];
  };
  if (typeof p.formality !== 'number') return null;
  const formalityLabel =
    p.formality <= 3
      ? 'very casual'
      : p.formality <= 5
        ? 'casual'
        : p.formality <= 7
          ? 'polished'
          : 'formal';
  const emoji =
    (p.emojiRate ?? 0) > 0.5
      ? 'with emojis'
      : (p.emojiRate ?? 0) > 0.1
        ? 'some emojis'
        : 'no emojis';
  const length = p.preferredLength ?? 'medium';
  const sent = p.avgSentenceLength ? ` · ~${Math.round(p.avgSentenceLength)} words/sentence` : '';
  const quirk = p.quirks?.[0] ? ` · quirk: "${p.quirks[0]}"` : '';
  return `${formalityLabel} · ${length} · ${emoji}${sent}${quirk}`;
}
