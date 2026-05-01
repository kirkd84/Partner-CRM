'use server';

/**
 * Automation cadence admin actions.
 *
 * A cadence is an ordered list of steps that fires when a partner
 * enters a given stage. Each step points at a MessageTemplate and says
 * "X hours after stage entry, send this". Steps can be marked as
 * "require approval" — the send falls into the approval queue instead
 * of going out autonomously.
 *
 * Steps are stored as JSON on AutomationCadence.steps because the
 * number + shape varies per cadence and we don't want a separate table
 * round-trip every time.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';

export type MessageKind = 'EMAIL' | 'SMS';
export type PartnerStage =
  | 'NEW_LEAD'
  | 'RESEARCHED'
  | 'INITIAL_CONTACT'
  | 'MEETING_SCHEDULED'
  | 'IN_CONVERSATION'
  | 'PROPOSAL_SENT'
  | 'ACTIVATED'
  | 'INACTIVE';

export interface CadenceStepInput {
  offsetHours: number;
  kind: MessageKind;
  templateId: string;
  /** If true, send goes into the approval queue rather than firing autonomously. */
  requireApproval: boolean;
}

export interface CadenceInput {
  name: string;
  triggerStage: PartnerStage;
  steps: CadenceStepInput[];
  active: boolean;
}

async function assertManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN: manager+ required');
  }
  return session;
}

function normalize(input: CadenceInput) {
  if (!input.name.trim()) throw new Error('Follow-Up name required');
  if (input.steps.length === 0) {
    throw new Error('A Follow-Up needs at least one step — otherwise nothing ever fires.');
  }
  if (input.steps.length > 12) {
    throw new Error('Cap is 12 steps per Follow-Up. Split this into multiple Follow-Ups.');
  }
  for (const [i, s] of input.steps.entries()) {
    if (!s.templateId) throw new Error(`Step ${i + 1}: pick a template.`);
    if (!Number.isFinite(s.offsetHours) || s.offsetHours < 0) {
      throw new Error(`Step ${i + 1}: offset hours must be ≥ 0.`);
    }
    if (s.offsetHours > 24 * 90) {
      throw new Error(`Step ${i + 1}: offset can't be more than 90 days out.`);
    }
  }
  return {
    name: input.name.trim(),
    triggerStage: input.triggerStage,
    active: input.active,
    // Sort steps by offset so the worker can walk them in order.
    steps: [...input.steps].sort((a, b) => a.offsetHours - b.offsetHours),
  };
}

/** Validate that every step's templateId exists and its kind matches the step's kind. */
async function assertTemplatesExist(steps: CadenceStepInput[]) {
  const ids = [...new Set(steps.map((s) => s.templateId))];
  if (ids.length === 0) return;
  const found = await prisma.messageTemplate.findMany({
    where: { id: { in: ids } },
    select: { id: true, kind: true, active: true, name: true },
  });
  const byId = new Map(found.map((t) => [t.id, t]));
  for (const [i, s] of steps.entries()) {
    const t = byId.get(s.templateId);
    if (!t) throw new Error(`Step ${i + 1}: template no longer exists.`);
    if (!t.active) {
      throw new Error(`Step ${i + 1}: "${t.name}" is archived. Pick an active template.`);
    }
    if (t.kind !== s.kind) {
      throw new Error(`Step ${i + 1}: "${t.name}" is ${t.kind} but step is marked ${s.kind}.`);
    }
  }
}

export async function createCadence(input: CadenceInput) {
  const session = await assertManagerPlus();
  const data = normalize(input);
  await assertTemplatesExist(data.steps);

  const created = await prisma.automationCadence.create({
    data: {
      name: data.name,
      triggerStage: data.triggerStage,
      active: data.active,
      steps: data.steps as unknown as Prisma.InputJsonValue,
      createdBy: session.user.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'automation_cadence',
      entityId: created.id,
      action: 'create',
      diff: {
        name: data.name,
        triggerStage: data.triggerStage,
        stepCount: data.steps.length,
      } as Prisma.InputJsonValue,
    },
  });
  revalidatePath('/admin/ai-follow-ups');
}

export async function updateCadence(id: string, input: CadenceInput) {
  const session = await assertManagerPlus();
  const data = normalize(input);
  await assertTemplatesExist(data.steps);

  const prev = await prisma.automationCadence.findUnique({ where: { id } });
  if (!prev) throw new Error('NOT_FOUND');

  await prisma.$transaction([
    prisma.automationCadence.update({
      where: { id },
      data: {
        name: data.name,
        triggerStage: data.triggerStage,
        active: data.active,
        steps: data.steps as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'automation_cadence',
        entityId: id,
        action: 'update',
        diff: {
          before: {
            name: prev.name,
            triggerStage: prev.triggerStage,
            active: prev.active,
            stepCount: Array.isArray(prev.steps) ? prev.steps.length : 0,
          },
          after: {
            name: data.name,
            triggerStage: data.triggerStage,
            active: data.active,
            stepCount: data.steps.length,
          },
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/ai-follow-ups');
}

/** Soft-delete: deactivating is always safe, executions in flight keep going. */
export async function archiveCadence(id: string) {
  const session = await assertManagerPlus();
  await prisma.$transaction([
    prisma.automationCadence.update({ where: { id }, data: { active: false } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'automation_cadence',
        entityId: id,
        action: 'archive',
        diff: {} as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/ai-follow-ups');
}

export async function restoreCadence(id: string) {
  const session = await assertManagerPlus();
  await prisma.$transaction([
    prisma.automationCadence.update({ where: { id }, data: { active: true } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'automation_cadence',
        entityId: id,
        action: 'restore',
        diff: {} as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/ai-follow-ups');
}
