/**
 * /admin/ai-follow-ups — AI-personalized multi-step outreach.
 *
 * When a partner's stage changes to a follow-up's triggerStage, the
 * worker schedules every step at (now + offsetHours). Each step either
 * sends autonomously or queues into the approval drawer. When
 * ANTHROPIC_API_KEY is set, every send is rewritten by Claude Haiku
 * against the rep's tone profile + recent activity so the partner sees
 * a personal-feeling note instead of a template blast.
 *
 * The DB model is still named AutomationCadence — internal name kept
 * to avoid a migration. UI surfaces all say "AI Follow-Up".
 */

import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Table, THead, TBody, TR, TH, TD, Pill } from '@partnerradar/ui';
import { Workflow } from 'lucide-react';
import { NewCadenceButton, CadenceRowActions } from './CadencesClient';
import type { CadenceStepInput, PartnerStage, MessageKind } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminCadencesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') redirect('/radar');

  type Row = {
    id: string;
    name: string;
    triggerStage: PartnerStage;
    steps: unknown;
    active: boolean;
    updatedAt: Date;
  };

  let rawCadences: Row[] = [];
  try {
    rawCadences = await prisma.automationCadence.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        triggerStage: true,
        steps: true,
        active: true,
        updatedAt: true,
      },
    });
  } catch {
    rawCadences = [];
  }

  const cadences = rawCadences.map((c) => ({
    ...c,
    steps: coerceSteps(c.steps),
  }));

  // Pull per-cadence execution stats in one shot. Group by cadenceId
  // + bucketed outcome so the table can surface "12 scheduled · 8
  // sent · 2 blocked" per row. Graceful fallback keeps the table
  // rendering even if CadenceExecution hasn't been migrated yet.
  type ExecRow = { cadenceId: string; executedAt: Date | null; outcome: string | null };
  let executions: ExecRow[] = [];
  try {
    executions = await prisma.cadenceExecution.findMany({
      where: { cadenceId: { in: cadences.map((c) => c.id) } },
      select: { cadenceId: true, executedAt: true, outcome: true },
    });
  } catch {
    executions = [];
  }

  const statsByCadence = new Map<
    string,
    { scheduled: number; sent: number; blocked: number; failed: number; pending: number }
  >();
  for (const c of cadences) {
    statsByCadence.set(c.id, { scheduled: 0, sent: 0, blocked: 0, failed: 0, pending: 0 });
  }
  for (const e of executions) {
    const s = statsByCadence.get(e.cadenceId);
    if (!s) continue;
    if (!e.executedAt) {
      s.scheduled += 1;
      continue;
    }
    const outcome = (e.outcome ?? '').toLowerCase();
    if (outcome === 'sent' || outcome.startsWith('sent:')) s.sent += 1;
    else if (outcome.startsWith('blocked')) s.blocked += 1;
    else if (outcome.startsWith('pending_approval')) s.pending += 1;
    else s.failed += 1;
  }

  // Template picker source. Pull active + kind so the cadence editor
  // can scope the template dropdown by kind.
  type TemplateRow = {
    id: string;
    name: string;
    kind: MessageKind;
    active: boolean;
    stage: PartnerStage | null;
  };
  let templates: TemplateRow[] = [];
  try {
    templates = await prisma.messageTemplate.findMany({
      where: { active: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, kind: true, active: true, stage: true },
    });
  } catch {
    templates = [];
  }

  const activeCount = cadences.filter((c) => c.active).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">AI Follow-Ups</h1>
          <p className="text-xs text-gray-500">
            {activeCount} active · {cadences.length - activeCount} archived · fires when partners
            enter a given stage
          </p>
        </div>
        <div className="ml-auto">
          <NewCadenceButton templates={templates} />
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-white">
        {cadences.length === 0 ? (
          <div className="p-10 text-center">
            <Workflow className="mx-auto h-8 w-8 text-gray-300" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No follow-ups yet</h3>
            <p className="text-xs text-gray-500">
              Create an AI Follow-Up to automate post-meeting check-ins, re-engagement pings, or any
              multi-step outreach. Each step gets personalized in your voice at send time.
            </p>
            {templates.length === 0 && (
              <p className="mt-3 text-[11px] text-amber-700">
                Tip: create a couple of message templates first — Follow-Ups reference them step by
                step.
              </p>
            )}
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Triggers on</TH>
                <TH>Steps</TH>
                <TH>Timeline</TH>
                <TH>Execution</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {cadences.map((c) => {
                const s = statsByCadence.get(c.id) ?? {
                  scheduled: 0,
                  sent: 0,
                  blocked: 0,
                  failed: 0,
                  pending: 0,
                };
                return (
                  <TR key={c.id}>
                    <TD>
                      <span className="font-medium text-gray-900">{c.name}</span>
                    </TD>
                    <TD>
                      <Pill color="#6366f1" tone="soft">
                        {humanizeStage(c.triggerStage)}
                      </Pill>
                    </TD>
                    <TD>
                      <span className="text-xs text-gray-700">
                        {c.steps.length} step{c.steps.length === 1 ? '' : 's'}
                      </span>
                    </TD>
                    <TD>
                      <span className="text-xs text-gray-600">{summarizeTimeline(c.steps)}</span>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1">
                        {s.scheduled > 0 && (
                          <Pill color="#0ea5e9" tone="soft" title="Waiting to fire">
                            {s.scheduled} scheduled
                          </Pill>
                        )}
                        {s.sent > 0 && (
                          <Pill color="#10b981" tone="soft">
                            {s.sent} sent
                          </Pill>
                        )}
                        {s.pending > 0 && (
                          <Pill color="#f59e0b" tone="soft" title="Waiting on approval">
                            {s.pending} pending
                          </Pill>
                        )}
                        {s.blocked > 0 && (
                          <Pill
                            color="#6b7280"
                            tone="soft"
                            title="Blocked — consent, quiet hours, or no address"
                          >
                            {s.blocked} blocked
                          </Pill>
                        )}
                        {s.failed > 0 && (
                          <Pill color="#ef4444" tone="soft">
                            {s.failed} failed
                          </Pill>
                        )}
                        {s.scheduled + s.sent + s.pending + s.blocked + s.failed === 0 && (
                          <span className="text-[11px] text-gray-400">No runs yet</span>
                        )}
                      </div>
                    </TD>
                    <TD>
                      {c.active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-300" /> Archived
                        </span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <CadenceRowActions
                        cadence={{
                          id: c.id,
                          name: c.name,
                          triggerStage: c.triggerStage,
                          steps: c.steps,
                          active: c.active,
                        }}
                        templates={templates}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function coerceSteps(raw: unknown): CadenceStepInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (typeof r !== 'object' || r === null) return null;
      const obj = r as Record<string, unknown>;
      const offsetHours = Number(obj.offsetHours);
      const kind = obj.kind === 'SMS' ? 'SMS' : 'EMAIL';
      const templateId = typeof obj.templateId === 'string' ? obj.templateId : '';
      const requireApproval = Boolean(obj.requireApproval);
      if (!Number.isFinite(offsetHours) || offsetHours < 0) return null;
      return { offsetHours, kind, templateId, requireApproval } satisfies CadenceStepInput;
    })
    .filter((s): s is CadenceStepInput => s !== null)
    .sort((a, b) => a.offsetHours - b.offsetHours);
}

function summarizeTimeline(steps: CadenceStepInput[]): string {
  if (steps.length === 0) return '—';
  const first = steps[0]!.offsetHours;
  const last = steps[steps.length - 1]!.offsetHours;
  return `${formatHours(first)} → ${formatHours(last)}`;
}

function formatHours(h: number): string {
  if (h === 0) return 'T+0';
  if (h < 24) return `+${h}h`;
  const d = Math.round(h / 24);
  return `+${d}d`;
}

function humanizeStage(stage: string): string {
  return stage
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}
