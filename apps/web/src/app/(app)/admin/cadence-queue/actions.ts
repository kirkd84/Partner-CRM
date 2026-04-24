'use server';

/**
 * Approval actions for cadence executions flagged requireApproval.
 *
 * The worker marks those rows with outcome='pending_approval' instead
 * of firing them. Here admins/managers can:
 *   • approve → runs the dispatcher now, marks the outcome inline
 *   • drop    → marks the row as "blocked_by_approver" and moves on
 *
 * Both actions are idempotent — re-clicking a row that's already been
 * processed returns a friendly "already handled" result.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { runCadenceExecution } from '@/lib/jobs/cadence-worker';

async function assertManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role === 'REP') throw new Error('FORBIDDEN');
  return session;
}

function isPendingApproval(outcome: string | null): boolean {
  if (!outcome) return false;
  return outcome === 'pending_approval' || outcome.startsWith('pending_approval:');
}

export async function approveCadenceExecution(
  executionId: string,
): Promise<{ ok: boolean; outcome?: string; detail?: string }> {
  const session = await assertManagerPlus();
  const row = await prisma.cadenceExecution.findUnique({
    where: { id: executionId },
    select: {
      id: true,
      outcome: true,
      executedAt: true,
      partnerId: true,
      cadenceId: true,
      stepIndex: true,
    },
  });
  if (!row) throw new Error('NOT_FOUND');
  if (row.executedAt && !isPendingApproval(row.outcome)) {
    return { ok: false, detail: 'already_handled' };
  }

  // Flip the row back to "not executed yet" so the dispatcher treats
  // it as a fresh send. We skip the requireApproval flag on the step
  // for this one run by directly calling dispatcher logic — but
  // runCadenceExecution re-checks requireApproval and would bounce it
  // back. So we take a different approach: re-dispatch as if the flag
  // wasn't set. We do this by clearing executedAt + outcome, then
  // calling a specialised runner that skips the requireApproval guard.

  // Simpler path: call runCadenceExecutionSkipApproval. Since we don't
  // want to fork the worker just for this, inline a tiny custom dispatch.
  const cadence = await prisma.automationCadence.findUnique({
    where: { id: row.cadenceId },
    select: { steps: true, active: true, name: true },
  });
  if (!cadence?.active) {
    await prisma.cadenceExecution.update({
      where: { id: executionId },
      data: {
        executedAt: new Date(),
        outcome: 'blocked_cadence_inactive',
      },
    });
    return { ok: false, detail: 'cadence_inactive' };
  }

  const steps = Array.isArray(cadence.steps) ? (cadence.steps as unknown[]) : [];
  const step = steps[row.stepIndex] as { templateId?: string; kind?: string } | undefined;
  if (!step?.templateId) {
    await prisma.cadenceExecution.update({
      where: { id: executionId },
      data: { executedAt: new Date(), outcome: 'failed:step_missing' },
    });
    return { ok: false, detail: 'step_missing' };
  }

  // Re-enqueue by clearing executedAt and then calling the shared runner,
  // which will see requireApproval=true on the step config and bounce
  // again — NOT what we want. So we dispatch directly via the
  // dispatcher and write the outcome ourselves.
  const { dispatchAutomatedSend } = await import('@/lib/messaging/dispatcher');
  const repId = await pickSendingRep(row.partnerId);
  if (!repId) {
    await prisma.cadenceExecution.update({
      where: { id: executionId },
      data: { executedAt: new Date(), outcome: 'failed:no_rep_to_send' },
    });
    return { ok: false, detail: 'no_rep_to_send' };
  }

  const res = await dispatchAutomatedSend({
    partnerId: row.partnerId,
    repUserId: repId,
    templateId: step.templateId,
    channel: step.kind === 'SMS' ? 'sms' : 'email',
  });

  await prisma.$transaction([
    prisma.cadenceExecution.update({
      where: { id: executionId },
      data: {
        executedAt: new Date(),
        outcome: res.detail ? `${res.outcome}:${res.detail.slice(0, 50)}` : res.outcome,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'cadence_execution',
        entityId: executionId,
        action: 'approve_and_send',
        diff: { outcome: res.outcome, detail: res.detail } as Prisma.InputJsonValue,
      },
    }),
  ]);

  // Still use runCadenceExecution indirectly so the "sent" path is
  // consistent — but that's optional since we already did the work.
  void runCadenceExecution;

  revalidatePath('/admin/cadence-queue');
  revalidatePath('/admin/cadences');
  return { ok: true, outcome: res.outcome, detail: res.detail };
}

export async function dropCadenceExecution(executionId: string, reason: string): Promise<void> {
  const session = await assertManagerPlus();
  if (!reason.trim()) throw new Error('Reason required');
  const row = await prisma.cadenceExecution.findUnique({
    where: { id: executionId },
    select: { id: true, executedAt: true, outcome: true },
  });
  if (!row) throw new Error('NOT_FOUND');
  if (row.executedAt && !isPendingApproval(row.outcome)) return;

  await prisma.$transaction([
    prisma.cadenceExecution.update({
      where: { id: executionId },
      data: {
        executedAt: new Date(),
        outcome: `blocked_by_approver:${reason.trim().slice(0, 40)}`,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'cadence_execution',
        entityId: executionId,
        action: 'drop',
        diff: { reason: reason.trim() } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath('/admin/cadence-queue');
  revalidatePath('/admin/cadences');
}

async function pickSendingRep(partnerId: string): Promise<string | null> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { assignedRepId: true, activatedBy: true },
  });
  if (partner?.assignedRepId) return partner.assignedRepId;
  if (partner?.activatedBy) return partner.activatedBy;
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', active: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return admin?.id ?? null;
}
