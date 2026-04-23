'use server';

import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { prisma, Prisma } from '@partnerradar/db';
import type { Role } from '@partnerradar/types';
import { auth } from '@/auth';

const AVATAR_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#a855f7',
  '#f97316',
  '#06b6d4',
  '#ef4444',
];

async function assertIsAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'ADMIN') throw new Error('FORBIDDEN: admin required');
  return session;
}

async function assertIsManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN')
    throw new Error('FORBIDDEN: manager+ required');
  return session;
}

/**
 * Invite a new user. For now, generates a temporary password which the
 * admin hands to the invitee — full magic-link email lands when Resend
 * creds are wired in a later phase.
 *
 * Returns the temp password so the UI can display it once.
 */
export async function inviteUser(input: {
  email: string;
  name: string;
  role: Role;
  marketIds: string[];
}): Promise<{ tempPassword: string; userId: string }> {
  const session = await assertIsManagerPlus();
  // Managers can't create admins
  if (input.role === 'ADMIN' && session.user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN: only admins can create admins');
  }
  if (!input.email.trim() || !input.name.trim()) throw new Error('Email + name required');
  if (input.marketIds.length === 0) throw new Error('Assign at least one market');

  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('A user with that email already exists');

  const tempPassword = randomBytes(6).toString('base64url'); // 8 chars-ish
  const passwordHash = await hash(tempPassword, 10);
  // noUncheckedIndexedAccess widens array[n] to `T | undefined`; pick with a guaranteed fallback.
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? '#3b82f6';

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        name: input.name.trim(),
        role: input.role,
        passwordHash,
        avatarColor,
        markets: {
          create: input.marketIds.map((id, idx) => ({
            marketId: id,
            isPrimary: idx === 0,
          })),
        },
      },
    });
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'user',
        entityId: u.id,
        action: 'invite',
        diff: {
          email: u.email,
          role: u.role,
          markets: input.marketIds,
        } as Prisma.InputJsonValue,
      },
    });
    return u;
  });

  revalidatePath('/admin/users');
  return { tempPassword, userId: user.id };
}

export async function setUserRole(userId: string, role: Role) {
  const session = await assertIsAdmin();
  if (userId === session.user.id) throw new Error("Can't change your own role");
  const prev = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!prev) throw new Error('NOT_FOUND');
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'user',
        entityId: userId,
        action: 'role_change',
        diff: { from: prev.role, to: role } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/users');
}

export async function setUserMarkets(userId: string, marketIds: string[]) {
  const session = await assertIsManagerPlus();
  if (marketIds.length === 0) throw new Error('Assign at least one market');

  await prisma.$transaction(async (tx) => {
    await tx.userMarket.deleteMany({ where: { userId } });
    await tx.userMarket.createMany({
      data: marketIds.map((marketId, idx) => ({
        userId,
        marketId,
        isPrimary: idx === 0,
      })),
    });
    // Bump tokenVersion so any active session with stale markets is invalidated
    await tx.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'user',
        entityId: userId,
        action: 'markets_change',
        diff: { markets: marketIds } as Prisma.InputJsonValue,
      },
    });
  });
  revalidatePath('/admin/users');
}

export async function setUserActive(userId: string, active: boolean) {
  const session = await assertIsManagerPlus();
  if (userId === session.user.id) throw new Error("Can't deactivate yourself");
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { active, tokenVersion: { increment: 1 } },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'user',
        entityId: userId,
        action: active ? 'reactivate' : 'deactivate',
        diff: { active } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/users');
}

/**
 * Hard-delete a user. Safe only for users with no activity history —
 * once someone has activities, appointments, or expenses, the paper
 * trail is load-bearing and we "deactivate" instead.
 */
export async function deleteUser(userId: string) {
  const session = await assertIsAdmin();
  if (userId === session.user.id) throw new Error("Can't delete yourself");

  const [activityCount, apptCount, expenseCount, taskCount] = await Promise.all([
    prisma.activity.count({ where: { userId } }),
    prisma.appointment.count({ where: { userId } }),
    prisma.expense.count({ where: { userId } }),
    prisma.task.count({ where: { assigneeId: userId } }),
  ]);
  const totalHistory = activityCount + apptCount + expenseCount + taskCount;
  if (totalHistory > 0) {
    throw new Error(
      `User has ${totalHistory} history record${totalHistory === 1 ? '' : 's'} — deactivate instead of deleting.`,
    );
  }

  await prisma.$transaction([
    prisma.partner.updateMany({
      where: { assignedRepId: userId },
      data: { assignedRepId: null },
    }),
    prisma.user.delete({ where: { id: userId } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'user',
        entityId: userId,
        action: 'delete',
        diff: {} as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/users');
}

/** Resets the user's password to a freshly generated temp password. */
export async function resetPassword(userId: string): Promise<{ tempPassword: string }> {
  const session = await assertIsManagerPlus();
  const tempPassword = randomBytes(6).toString('base64url');
  const passwordHash = await hash(tempPassword, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'user',
        entityId: userId,
        action: 'password_reset',
        diff: {} as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/users');
  return { tempPassword };
}
