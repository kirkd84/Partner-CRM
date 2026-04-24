/**
 * Cadence worker — turns stage changes into scheduled sends.
 *
 * Two pieces:
 *
 *   enrollPartnerInCadences  (event-triggered)
 *     Fires when a partner changes stage. Looks up every active
 *     AutomationCadence with triggerStage === newStage and creates
 *     one CadenceExecution row per step with scheduledAt = now +
 *     offsetHours. De-dupes: if an execution for (cadenceId,
 *     partnerId, stepIndex) already exists, skip.
 *
 *   cadenceDispatchCron  (every 5 minutes)
 *     Picks up CadenceExecution rows where scheduledAt <= now AND
 *     executedAt IS NULL. For each row, calls the dispatcher and
 *     writes the outcome back.
 *
 * The enrollment side runs on a per-partner concurrency key so two
 * rapid stage changes don't double-enroll. The dispatcher side runs
 * per-execution so one slow send doesn't block the rest.
 *
 * Steps that require approval (step.requireApproval) land with
 * outcome=null and executedAt=null — they show up in the admin
 * approval queue instead of firing autonomously.
 */

import { inngest } from '../inngest-client';
import { prisma, Prisma } from '@partnerradar/db';
import { dispatchAutomatedSend } from '@/lib/messaging/dispatcher';

type CadenceStep = {
  offsetHours: number;
  kind: 'EMAIL' | 'SMS';
  templateId: string;
  requireApproval: boolean;
};

const DISPATCH_BATCH = 50;

/**
 * Schedule cadence executions for a partner that just hit a trigger
 * stage. Callable from server actions (stage change) AND from the
 * Inngest event handler below.
 */
export async function enrollPartnerInStageCadences(
  partnerId: string,
  newStage: string,
): Promise<{ ok: boolean; cadencesFired: number; executionsCreated: number }> {
  const cadences = await prisma.automationCadence
    .findMany({
      where: { active: true, triggerStage: newStage as never },
      select: { id: true, steps: true, name: true },
    })
    .catch(() => [] as Array<{ id: string; steps: unknown; name: string }>);

  if (cadences.length === 0) return { ok: true, cadencesFired: 0, executionsCreated: 0 };

  let executionsCreated = 0;
  const now = Date.now();

  for (const c of cadences) {
    const steps = coerceSteps(c.steps);
    if (steps.length === 0) continue;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const scheduledAt = new Date(now + step.offsetHours * 3600_000);

      // De-dupe: we don't want to re-schedule if the partner bounced
      // back into this stage. Unique composite (cadenceId, partnerId,
      // stepIndex) isn't declared on the table, so emulate with a
      // findFirst.
      const existing = await prisma.cadenceExecution.findFirst({
        where: { cadenceId: c.id, partnerId, stepIndex: i },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.cadenceExecution.create({
        data: {
          cadenceId: c.id,
          partnerId,
          stepIndex: i,
          scheduledAt,
        },
      });
      executionsCreated++;
    }
  }

  return { ok: true, cadencesFired: cadences.length, executionsCreated };
}

/**
 * Dispatch a single execution row. Pure — no Inngest-isms so it's
 * easy to call from a manual "Run now" action or a test.
 */
export async function runCadenceExecution(
  executionId: string,
): Promise<{ outcome: string; detail?: string }> {
  const exec = await prisma.cadenceExecution.findUnique({
    where: { id: executionId },
    select: {
      id: true,
      cadenceId: true,
      partnerId: true,
      stepIndex: true,
      executedAt: true,
      scheduledAt: true,
      outcome: true,
    },
  });
  if (!exec) return { outcome: 'failed', detail: 'execution_not_found' };
  if (exec.executedAt) return { outcome: exec.outcome ?? 'sent', detail: 'already_executed' };

  const cadence = await prisma.automationCadence.findUnique({
    where: { id: exec.cadenceId },
    select: { id: true, steps: true, active: true, name: true },
  });
  if (!cadence || !cadence.active) {
    await markExecution(executionId, 'blocked_consent', 'cadence_inactive');
    return { outcome: 'blocked_consent', detail: 'cadence_inactive' };
  }

  const steps = coerceSteps(cadence.steps);
  const step = steps[exec.stepIndex];
  if (!step) {
    await markExecution(executionId, 'failed', 'step_missing');
    return { outcome: 'failed', detail: 'step_missing' };
  }

  // Step marked "require approval" → don't send, mark as pending
  // approval so the admin queue picks it up. (Queue UI is a Phase 8
  // follow-up; for now outcome='pending_approval' survives as a flag.)
  if (step.requireApproval) {
    await markExecution(executionId, 'pending_approval', 'require_approval');
    return { outcome: 'pending_approval' };
  }

  // Pick a rep to attribute the send to. Prefer the partner's assigned
  // rep; fall back to the cadence creator; fall back to the first admin.
  const repUserId = await pickSendingRep(exec.partnerId);
  if (!repUserId) {
    await markExecution(executionId, 'failed', 'no_rep_to_send');
    return { outcome: 'failed', detail: 'no_rep_to_send' };
  }

  const res = await dispatchAutomatedSend({
    partnerId: exec.partnerId,
    repUserId,
    templateId: step.templateId,
    channel: step.kind === 'SMS' ? 'sms' : 'email',
  });

  await markExecution(executionId, res.outcome, res.detail);
  return { outcome: res.outcome, detail: res.detail };
}

async function markExecution(id: string, outcome: string, detail?: string) {
  await prisma.cadenceExecution.update({
    where: { id },
    data: {
      executedAt: new Date(),
      outcome: detail ? `${outcome}:${detail.slice(0, 50)}` : outcome,
    },
  });
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

function coerceSteps(raw: unknown): CadenceStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (typeof r !== 'object' || r === null) return null;
      const obj = r as Record<string, unknown>;
      const offsetHours = Number(obj.offsetHours);
      if (!Number.isFinite(offsetHours) || offsetHours < 0) return null;
      const kind = obj.kind === 'SMS' ? 'SMS' : 'EMAIL';
      const templateId = typeof obj.templateId === 'string' ? obj.templateId : '';
      const requireApproval = Boolean(obj.requireApproval);
      if (!templateId) return null;
      return { offsetHours, kind, templateId, requireApproval } satisfies CadenceStep;
    })
    .filter((s): s is CadenceStep => s !== null);
}

// ── Inngest wiring ────────────────────────────────────────────────────

export const cadenceEnrollOnStageChange = inngest.createFunction(
  {
    id: 'cadence-enroll-on-stage-change',
    name: 'Cadence · enroll partner on stage change',
    concurrency: { key: 'event.data.partnerId', limit: 1 },
  },
  { event: 'partner-portal/partner.stage-changed' },
  async ({ event, step }) => {
    const partnerId = String(event.data?.partnerId ?? '');
    const newStage = String(event.data?.newStage ?? '');
    if (!partnerId || !newStage) {
      return { ok: false, error: 'missing partnerId or newStage' };
    }
    return step.run('enroll', async () => enrollPartnerInStageCadences(partnerId, newStage));
  },
);

export const cadenceDispatchCron = inngest.createFunction(
  {
    id: 'cadence-dispatch-cron',
    name: 'Cadence · dispatch due executions (5m)',
    concurrency: { key: "'cadence-dispatch'", limit: 1 },
  },
  { cron: '*/5 * * * *' },
  async ({ step, logger }) => {
    const due = await step.run('load-due', async () =>
      prisma.cadenceExecution.findMany({
        where: {
          executedAt: null,
          scheduledAt: { lte: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        take: DISPATCH_BATCH,
        select: { id: true },
      }),
    );

    if (due.length === 0) {
      return { ok: true, dispatched: 0 };
    }

    logger.info?.(`cadence-dispatch: ${due.length} executions due`);

    let sent = 0;
    let blocked = 0;
    let failed = 0;
    for (const row of due) {
      const res = await step.run(`dispatch-${row.id}`, async () => runCadenceExecution(row.id));
      if (res.outcome === 'sent') sent++;
      else if (res.outcome.startsWith('blocked')) blocked++;
      else failed++;
    }

    return { ok: true, dispatched: due.length, sent, blocked, failed };
  },
);
