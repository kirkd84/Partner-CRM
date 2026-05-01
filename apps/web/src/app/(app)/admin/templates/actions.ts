'use server';

/**
 * Message template admin actions.
 *
 * Templates are shared across the tenant. Managers+admins can create
 * and edit; we soft-delete via `active = false` so cadences that still
 * reference the template don't explode.
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

export interface TemplateInput {
  kind: MessageKind;
  name: string;
  subject: string | null; // email only
  body: string;
  stage: PartnerStage | null;
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

// SMS character cap — two SMS segments. Keeps messages from silently
// fragmenting into 4+ parts on carriers with 7-bit encoding.
const SMS_MAX = 320;

function normalize(input: TemplateInput) {
  if (!input.name.trim()) throw new Error('Template name required');
  if (!input.body.trim()) throw new Error('Template body required');
  if (input.kind === 'EMAIL' && !input.subject?.trim()) {
    throw new Error('Subject required for email templates');
  }
  if (input.kind === 'SMS' && input.body.length > SMS_MAX) {
    throw new Error(
      `SMS body is ${input.body.length} chars — keep it under ${SMS_MAX} to avoid fragmenting.`,
    );
  }
  return {
    kind: input.kind,
    name: input.name.trim(),
    subject: input.kind === 'EMAIL' ? (input.subject?.trim() ?? null) : null,
    body: input.body,
    stage: input.stage,
    active: input.active,
  };
}

export async function createTemplate(input: TemplateInput) {
  const session = await assertManagerPlus();
  const data = normalize(input);

  const created = await prisma.messageTemplate.create({
    data: {
      ...data,
      createdBy: session.user.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'message_template',
      entityId: created.id,
      action: 'create',
      diff: {
        kind: data.kind,
        name: data.name,
        stage: data.stage,
      } as Prisma.InputJsonValue,
    },
  });
  revalidatePath('/admin/templates');
}

export async function updateTemplate(id: string, input: TemplateInput) {
  const session = await assertManagerPlus();
  const data = normalize(input);

  const prev = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!prev) throw new Error('NOT_FOUND');

  await prisma.$transaction([
    prisma.messageTemplate.update({ where: { id }, data }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'message_template',
        entityId: id,
        action: 'update',
        diff: {
          before: {
            kind: prev.kind,
            name: prev.name,
            stage: prev.stage,
            active: prev.active,
          },
          after: {
            kind: data.kind,
            name: data.name,
            stage: data.stage,
            active: data.active,
          },
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/templates');
}

/** Soft-delete (deactivate). Hard delete is blocked because cadences reference templateIds. */
export async function archiveTemplate(id: string) {
  const session = await assertManagerPlus();
  const prev = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!prev) throw new Error('NOT_FOUND');
  await prisma.$transaction([
    prisma.messageTemplate.update({ where: { id }, data: { active: false } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'message_template',
        entityId: id,
        action: 'archive',
        diff: {} as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/templates');
}

export async function restoreTemplate(id: string) {
  const session = await assertManagerPlus();
  await prisma.$transaction([
    prisma.messageTemplate.update({ where: { id }, data: { active: true } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'message_template',
        entityId: id,
        action: 'restore',
        diff: {} as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/templates');
}

/** Hard-delete: only safe when no cadence references this template. */
export async function deleteTemplate(id: string) {
  const session = await assertManagerPlus();
  const prev = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!prev) throw new Error('NOT_FOUND');

  // Check cadences that reference this template id. Steps are stored as
  // JSON so we can't use a relation constraint.
  const cadences = await prisma.automationCadence
    .findMany({ where: { active: true }, select: { id: true, steps: true, name: true } })
    .catch(() => [] as Array<{ id: string; steps: unknown; name: string }>);
  const referenced = cadences.find((c) => {
    if (!Array.isArray(c.steps)) return false;
    return (c.steps as Array<{ templateId?: string }>).some((s) => s?.templateId === id);
  });
  if (referenced) {
    throw new Error(
      `"${prev.name}" is used by active AI Follow-Up "${referenced.name}". Archive it or detach the step first.`,
    );
  }

  await prisma.$transaction([
    prisma.messageTemplate.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'message_template',
        entityId: id,
        action: 'delete',
        diff: { name: prev.name } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/templates');
}
