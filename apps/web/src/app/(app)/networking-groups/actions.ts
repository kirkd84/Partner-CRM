'use server';

/**
 * Networking groups — CAI, BNI, Chamber, REIA, etc.
 *
 * Roof Tech belongs to a handful of these. Each rep logs which
 * partners they've met through which group, the meetings they attend,
 * and the dues / sponsorships / dinner spend tied to the group. The
 * detail page rolls all of that up into a 'is this group worth it?'
 * scoreboard.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { activeTenantId } from '@/lib/tenant/context';

async function assertManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const ok =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!ok) throw new Error('FORBIDDEN: manager+');
  return session;
}

export interface CreateNetworkingGroupInput {
  name: string;
  shortCode?: string;
  marketId?: string | null;
  websiteUrl?: string;
  meetingCadence?: string;
  notes?: string;
}

export async function createNetworkingGroup(input: CreateNetworkingGroupInput) {
  const session = await assertManagerPlus();
  if (!input.name.trim()) throw new Error('Name is required');
  const tenantId = await activeTenantId(session);

  const group = await prisma.networkingGroup.create({
    data: {
      tenantId: tenantId ?? null,
      marketId: input.marketId ?? null,
      name: input.name.trim(),
      shortCode: input.shortCode?.trim() || null,
      websiteUrl: input.websiteUrl?.trim() || null,
      meetingCadence: input.meetingCadence?.trim() || null,
      notes: input.notes?.trim() || null,
      createdBy: session.user.id,
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'NetworkingGroup',
      entityId: group.id,
      action: 'CREATE',
      diff: { name: input.name.trim() },
    },
  });

  revalidatePath('/networking-groups');
  return { ok: true, id: group.id };
}

export async function updateNetworkingGroup(
  id: string,
  input: Partial<CreateNetworkingGroupInput> & { archived?: boolean },
) {
  const session = await assertManagerPlus();
  await prisma.networkingGroup.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.shortCode !== undefined && { shortCode: input.shortCode?.trim() || null }),
      ...(input.marketId !== undefined && { marketId: input.marketId ?? null }),
      ...(input.websiteUrl !== undefined && { websiteUrl: input.websiteUrl?.trim() || null }),
      ...(input.meetingCadence !== undefined && {
        meetingCadence: input.meetingCadence?.trim() || null,
      }),
      ...(input.notes !== undefined && { notes: input.notes?.trim() || null }),
      ...(input.archived !== undefined && { archivedAt: input.archived ? new Date() : null }),
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'NetworkingGroup',
      entityId: id,
      action: 'UPDATE',
      diff: input,
    },
  });
  revalidatePath('/networking-groups');
  revalidatePath(`/networking-groups/${id}`);
  return { ok: true };
}

export async function addPartnerToGroup(input: {
  groupId: string;
  partnerId: string;
  role?: string;
  joinedAt?: string; // ISO
}) {
  const session = await assertManagerPlus();
  // Use upsert so re-adding a previously-removed partner just bumps
  // the row instead of unique-constraint exploding.
  await prisma.networkingGroupMembership.upsert({
    where: {
      groupId_partnerId: {
        groupId: input.groupId,
        partnerId: input.partnerId,
      },
    },
    create: {
      groupId: input.groupId,
      partnerId: input.partnerId,
      role: input.role?.trim() || null,
      joinedAt: input.joinedAt ? new Date(input.joinedAt) : null,
    },
    update: {
      role: input.role?.trim() || null,
      joinedAt: input.joinedAt ? new Date(input.joinedAt) : null,
      leftAt: null,
    },
  });
  revalidatePath(`/networking-groups/${input.groupId}`);
  revalidatePath(`/partners/${input.partnerId}`);
  return { ok: true };
}

export async function removePartnerFromGroup(groupId: string, partnerId: string) {
  const session = await assertManagerPlus();
  // Soft-remove via leftAt so the historical attribution survives.
  await prisma.networkingGroupMembership.update({
    where: { groupId_partnerId: { groupId, partnerId } },
    data: { leftAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'NetworkingGroupMembership',
      entityId: `${groupId}:${partnerId}`,
      action: 'REMOVE',
      diff: { groupId, partnerId },
    },
  });
  revalidatePath(`/networking-groups/${groupId}`);
  return { ok: true };
}

export async function logGroupMeeting(input: {
  groupId: string;
  occurredOn: string;
  topic?: string;
  notes?: string;
  attendeesNote?: string;
  spendDollars?: number;
}) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');

  const cents =
    typeof input.spendDollars === 'number' && Number.isFinite(input.spendDollars)
      ? Math.round(input.spendDollars * 100)
      : null;

  await prisma.networkingGroupMeeting.create({
    data: {
      groupId: input.groupId,
      userId: session.user.id,
      occurredOn: new Date(input.occurredOn),
      topic: input.topic?.trim() || null,
      notes: input.notes?.trim() || null,
      attendeesNote: input.attendeesNote?.trim() || null,
      spendCents: cents,
    },
  });
  revalidatePath(`/networking-groups/${input.groupId}`);
  return { ok: true };
}

export async function deleteGroupMeeting(meetingId: string) {
  const session = await assertManagerPlus();
  const meeting = await prisma.networkingGroupMeeting.findUnique({
    where: { id: meetingId },
    select: { groupId: true },
  });
  if (!meeting) return { ok: true };
  await prisma.networkingGroupMeeting.delete({ where: { id: meetingId } });
  revalidatePath(`/networking-groups/${meeting.groupId}`);
  return { ok: true };
}
