'use server';

import { revalidatePath } from 'next/cache';
import { compare, hash } from 'bcryptjs';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { syncOneConnection } from '@/lib/jobs/google-calendar-sync';

interface ProfileInput {
  name: string;
  avatarColor: string;
  homeAddress?: string;
  officeAddress?: string;
  defaultStart?: 'HOME' | 'OFFICE' | 'LAST_STOP' | 'CUSTOM';
  preferredMapApp?: 'GOOGLE' | 'APPLE';
  soundEffects?: boolean;
  notificationPrefs?: {
    taskDue?: boolean;
    stageChange?: boolean;
    activation?: boolean;
    mentionInComment?: boolean;
  };
}

export async function updateProfile(input: ProfileInput) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (!input.name.trim()) throw new Error('Name required');

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: input.name.trim(),
        avatarColor: input.avatarColor,
        homeAddress: input.homeAddress?.trim() || null,
        officeAddress: input.officeAddress?.trim() || null,
        defaultStart: input.defaultStart ?? 'OFFICE',
        preferredMapApp: input.preferredMapApp ?? 'GOOGLE',
        soundEffects: input.soundEffects ?? true,
        notificationPrefs: (input.notificationPrefs ?? {}) as Prisma.InputJsonValue,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'user',
        entityId: session.user.id,
        action: 'profile_update',
        diff: {
          name: input.name,
          avatarColor: input.avatarColor,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath('/settings');
}

/**
 * Change the caller's password. Verifies current first. Bumps
 * tokenVersion so other active sessions are invalidated.
 */
export async function changePassword(currentPassword: string, newPassword: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) throw new Error('No password set (SSO user?)');
  const ok = await compare(currentPassword, user.passwordHash);
  if (!ok) throw new Error('Current password is incorrect');

  const newHash = await hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'user',
        entityId: session.user.id,
        action: 'password_change',
        diff: {} as Prisma.InputJsonValue,
      },
    }),
  ]);
}

// ─── Calendar connection actions ─────────────────────────────────────

/**
 * Manual "Sync now" — bypasses Inngest entirely and runs the sync
 * synchronously. Handy for debugging (tells you the error inline),
 * and for the moment right after connecting when Inngest may not have
 * picked up the new functions yet.
 */
export async function syncCalendarConnectionNow(
  connectionId: string,
): Promise<{ ok: boolean; synced: number; error?: string }> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');

  // Only the owner can trigger their own sync.
  const conn = await prisma.calendarConnection.findUnique({
    where: { id: connectionId },
    select: { userId: true },
  });
  if (!conn) throw new Error('NOT_FOUND');
  if (conn.userId !== session.user.id) throw new Error('FORBIDDEN');

  const result = await syncOneConnection(connectionId);
  revalidatePath('/settings');
  revalidatePath('/calendar');
  return result;
}

/**
 * List every calendar the rep has access to on a connected Google
 * account, along with whether it's currently selected for sync. Used
 * by the CalendarPicker component on /settings so reps don't sync a
 * dozen calendars when they only want two.
 */
export async function listGoogleCalendarsForConnection(connectionId: string): Promise<{
  ok: boolean;
  calendars: Array<{
    id: string;
    summary: string;
    primary: boolean;
    backgroundColor?: string;
    accessRole: string;
    selected: boolean;
  }>;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const conn = await prisma.calendarConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn) throw new Error('NOT_FOUND');
  if (conn.userId !== session.user.id) throw new Error('FORBIDDEN');
  if (conn.provider !== 'google') {
    return { ok: false, calendars: [], error: 'not a Google connection' };
  }
  if (!conn.refreshTokenEncrypted) {
    return { ok: false, calendars: [], error: 'no refresh token stored' };
  }

  const { decryptSecret } = await import('@partnerradar/integrations');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, calendars: [], error: 'Google creds not configured' };
  }

  // Mint a short-lived access token from the stored refresh token.
  const refreshToken = decryptSecret(conn.refreshTokenEncrypted);
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return { ok: false, calendars: [], error: `refresh failed: ${text.slice(0, 200)}` };
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Pull the list.
  const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!listRes.ok) {
    const text = await listRes.text();
    return { ok: false, calendars: [], error: `calendarList failed: ${text.slice(0, 200)}` };
  }
  const payload = (await listRes.json()) as {
    items?: Array<{
      id: string;
      summary: string;
      primary?: boolean;
      backgroundColor?: string;
      accessRole: string;
    }>;
  };
  const items = payload.items ?? [];

  // Which ones are already picked? The schema stores "primary" as a
  // pseudo-id for "the rep's default calendar" — normalise that so the
  // UI doesn't get confused when primary hasn't been replaced with
  // its canonical calendar id yet.
  const selected = new Set(conn.calendarIds);
  if (selected.has('primary')) {
    const primary = items.find((i) => i.primary);
    if (primary) selected.add(primary.id);
  }

  // Primary first, then everything else A→Z.
  items.sort((a, b) => {
    if (a.primary && !b.primary) return -1;
    if (!a.primary && b.primary) return 1;
    return a.summary.localeCompare(b.summary);
  });

  return {
    ok: true,
    calendars: items.map((i) => ({
      id: i.id,
      summary: i.summary,
      primary: Boolean(i.primary),
      backgroundColor: i.backgroundColor,
      accessRole: i.accessRole,
      selected: selected.has(i.id) || (i.primary && conn.calendarIds.includes('primary')),
    })),
  };
}

/**
 * Persist the rep's selected calendar ids for a connection. The sync
 * worker picks this up on its next run (or call syncCalendarConnectionNow
 * right after).
 */
export async function updateCalendarSelection(
  connectionId: string,
  calendarIds: string[],
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const conn = await prisma.calendarConnection.findUnique({
    where: { id: connectionId },
    select: { userId: true },
  });
  if (!conn) throw new Error('NOT_FOUND');
  if (conn.userId !== session.user.id) throw new Error('FORBIDDEN');

  await prisma.calendarConnection.update({
    where: { id: connectionId },
    data: { calendarIds: calendarIds.slice(0, 50) }, // safety cap
  });
  revalidatePath('/settings');
}

export async function disconnectCalendarConnection(connectionId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const conn = await prisma.calendarConnection.findUnique({
    where: { id: connectionId },
    select: { userId: true, provider: true, externalAccountId: true },
  });
  if (!conn) throw new Error('NOT_FOUND');
  if (conn.userId !== session.user.id) throw new Error('FORBIDDEN');

  // Hard-delete the connection and its cached events. Tokens go with it.
  await prisma.$transaction([
    prisma.calendarEventCache.deleteMany({
      where: { connectionId },
    }),
    prisma.calendarConnection.delete({ where: { id: connectionId } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'calendar_connection',
        entityId: connectionId,
        action: 'disconnect',
        diff: {
          provider: conn.provider,
          account: conn.externalAccountId,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath('/settings');
  revalidatePath('/calendar');
}
