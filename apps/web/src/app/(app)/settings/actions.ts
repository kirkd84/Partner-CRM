'use server';

import { revalidatePath } from 'next/cache';
import { compare, hash } from 'bcryptjs';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';

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
