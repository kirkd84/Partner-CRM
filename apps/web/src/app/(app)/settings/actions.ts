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
