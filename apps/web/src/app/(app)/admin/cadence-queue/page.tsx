/**
 * /admin/cadence-queue — cadence steps awaiting human approval.
 *
 * When an AutomationCadence step has requireApproval=true, the worker
 * writes outcome='pending_approval' on the CadenceExecution row and
 * stops. This page surfaces those rows with approve + drop actions.
 *
 * Manager+ only (REPs can see their own drafts on partner detail,
 * but queue management is a moderation surface).
 */

import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Table, THead, TBody, TR, TH, TD, Pill } from '@partnerradar/ui';
import { Sparkles } from 'lucide-react';
import { QueueRowActions } from './QueueRowActions';

export const dynamic = 'force-dynamic';

export default async function CadenceQueuePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/radar');

  // Pull pending rows + join the bits we need to render. Small query
  // surface — only rows that still need human action.
  const rows = await prisma.cadenceExecution
    .findMany({
      where: {
        OR: [{ outcome: 'pending_approval' }, { outcome: { startsWith: 'pending_approval:' } }],
      },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    })
    .catch(() => []);

  // Join manually — CadenceExecution doesn't have FK relations declared
  // in the current schema for partner/cadence, so we pull them in a
  // second round-trip.
  const partnerIds = [...new Set(rows.map((r) => r.partnerId))];
  const cadenceIds = [...new Set(rows.map((r) => r.cadenceId))];
  const [partners, cadences] = await Promise.all([
    partnerIds.length === 0
      ? Promise.resolve([])
      : prisma.partner.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, companyName: true, stage: true, publicId: true },
        }),
    cadenceIds.length === 0
      ? Promise.resolve([])
      : prisma.automationCadence.findMany({
          where: { id: { in: cadenceIds } },
          select: { id: true, name: true, steps: true, triggerStage: true },
        }),
  ]);

  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const cadenceById = new Map(cadences.map((c) => [c.id, c]));

  const enriched = rows.map((r) => {
    const cadence = cadenceById.get(r.cadenceId);
    const step = Array.isArray(cadence?.steps)
      ? (cadence!.steps as Array<{ templateId?: string; kind?: string; offsetHours?: number }>)[
          r.stepIndex
        ]
      : undefined;
    return {
      id: r.id,
      scheduledAt: r.scheduledAt,
      partner: partnerById.get(r.partnerId),
      cadence: cadence,
      step,
      stepIndex: r.stepIndex,
    };
  });

  // Template names for the step label.
  const templateIds = [
    ...new Set(enriched.map((e) => e.step?.templateId).filter(Boolean) as string[]),
  ];
  const templates =
    templateIds.length === 0
      ? []
      : await prisma.messageTemplate
          .findMany({
            where: { id: { in: templateIds } },
            select: { id: true, name: true },
          })
          .catch(() => []);
  const templateById = new Map(templates.map((t) => [t.id, t]));

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Cadence approval queue</h1>
        <p className="text-xs text-gray-500">
          Sends from automation cadences that are marked "Require approval before sending". Approve
          runs them through the dispatcher (consent + quiet hours still apply). Drop kills the send.
        </p>
      </header>

      <div className="flex-1 overflow-auto bg-white">
        {enriched.length === 0 ? (
          <div className="p-10 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-gray-300" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">Nothing awaiting approval</h3>
            <p className="text-xs text-gray-500">
              Cadence steps that require approval will show up here the moment they're triggered.
            </p>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Scheduled</TH>
                <TH>Partner</TH>
                <TH>Cadence</TH>
                <TH>Step</TH>
                <TH>Channel</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {enriched.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <span className="text-xs text-gray-600">{formatDateTime(r.scheduledAt)}</span>
                  </TD>
                  <TD>
                    {r.partner ? (
                      <Link
                        href={`/partners/${r.partner.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {r.partner.companyName}
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-400">Partner deleted</span>
                    )}
                  </TD>
                  <TD>
                    <span className="text-sm text-gray-700">{r.cadence?.name ?? '—'}</span>
                    {r.cadence?.triggerStage && (
                      <div className="mt-0.5">
                        <Pill color="#6366f1" tone="soft">
                          {humanizeStage(r.cadence.triggerStage)}
                        </Pill>
                      </div>
                    )}
                  </TD>
                  <TD>
                    <div className="text-xs text-gray-700">
                      Step {r.stepIndex + 1}
                      {r.step?.offsetHours != null && (
                        <span className="ml-1 text-gray-400">
                          (T+{formatOffset(r.step.offsetHours)})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Template:{' '}
                      {r.step?.templateId
                        ? (templateById.get(r.step.templateId)?.name ?? 'unknown')
                        : '—'}
                    </div>
                  </TD>
                  <TD>
                    <Pill color={r.step?.kind === 'SMS' ? '#0ea5e9' : '#6366f1'} tone="soft">
                      {r.step?.kind ?? '—'}
                    </Pill>
                  </TD>
                  <TD className="text-right">
                    <QueueRowActions executionId={r.id} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatOffset(h: number): string {
  if (h === 0) return '0h';
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

function humanizeStage(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}
