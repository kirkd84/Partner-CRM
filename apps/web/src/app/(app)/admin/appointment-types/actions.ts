'use server';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';

export interface AppointmentTypeInput {
  name: string;
  durationMinutes: number;
  reminderMinutesBefore: number | null;
  alertIfUnassigned: boolean;
  alertUserId: string | null;
}

async function assertManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN: manager+ required');
  }
  return session;
}

function normalize(input: AppointmentTypeInput) {
  if (!input.name.trim()) throw new Error('Name required');
  if (input.durationMinutes < 5 || input.durationMinutes > 480) {
    throw new Error('Duration must be between 5 and 480 minutes');
  }
  return {
    name: input.name.trim(),
    durationMinutes: Math.round(input.durationMinutes),
    reminderMinutesBefore:
      input.reminderMinutesBefore === null || input.reminderMinutesBefore === undefined
        ? null
        : Math.max(0, Math.round(input.reminderMinutesBefore)),
    alertIfUnassigned: Boolean(input.alertIfUnassigned),
    alertUserId: input.alertUserId || null,
  };
}

export async function createAppointmentType(input: AppointmentTypeInput) {
  const session = await assertManagerPlus();
  const data = normalize(input);

  const existing = await prisma.appointmentType.findUnique({ where: { name: data.name } });
  if (existing) throw new Error(`"${data.name}" already exists`);

  const created = await prisma.appointmentType.create({ data });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'appointment_type',
      entityId: created.id,
      action: 'create',
      diff: data as unknown as Prisma.InputJsonValue,
    },
  });
  revalidatePath('/admin/appointment-types');
}

export async function updateAppointmentType(id: string, input: AppointmentTypeInput) {
  const session = await assertManagerPlus();
  const data = normalize(input);

  const prev = await prisma.appointmentType.findUnique({ where: { id } });
  if (!prev) throw new Error('NOT_FOUND');

  await prisma.$transaction([
    prisma.appointmentType.update({ where: { id }, data }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'appointment_type',
        entityId: id,
        action: 'update',
        diff: {
          before: {
            name: prev.name,
            durationMinutes: prev.durationMinutes,
            reminderMinutesBefore: prev.reminderMinutesBefore,
            alertIfUnassigned: prev.alertIfUnassigned,
            alertUserId: prev.alertUserId,
          },
          after: data,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/appointment-types');
}

/**
 * Soft-delete: archive the type so it drops out of the new-appointment
 * picker but existing Appointment rows keep their reference. Full hard
 * delete is reserved for types that have never been used.
 */
export async function archiveAppointmentType(id: string) {
  const session = await assertManagerPlus();
  await prisma.$transaction([
    prisma.appointmentType.update({
      where: { id },
      data: { archivedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'appointment_type',
        entityId: id,
        action: 'archive',
        diff: {} as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/appointment-types');
}

export async function restoreAppointmentType(id: string) {
  const session = await assertManagerPlus();
  await prisma.$transaction([
    prisma.appointmentType.update({
      where: { id },
      data: { archivedAt: null },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'appointment_type',
        entityId: id,
        action: 'restore',
        diff: {} as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/appointment-types');
}
