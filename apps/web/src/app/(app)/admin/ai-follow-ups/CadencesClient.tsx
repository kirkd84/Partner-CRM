'use client';

/**
 * Client island for /admin/ai-follow-ups.
 *
 * The drawer hosts:
 *   • Name, trigger stage, active toggle
 *   • Step editor — add/remove/reorder rows, each row picks kind + template
 *   • Live summary of the timeline (sorted by offsetHours) so managers
 *     can eyeball the cadence shape without mentally sorting rows
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import {
  Pencil,
  Plus,
  Archive,
  RotateCcw,
  Trash2,
  GripVertical,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import {
  createCadence,
  updateCadence,
  archiveCadence,
  restoreCadence,
  type CadenceInput,
  type CadenceStepInput,
  type MessageKind,
  type PartnerStage,
} from './actions';

interface TemplateOption {
  id: string;
  name: string;
  kind: MessageKind;
  active: boolean;
  stage: PartnerStage | null;
}

interface ExistingCadence {
  id: string;
  name: string;
  triggerStage: PartnerStage;
  steps: CadenceStepInput[];
  active: boolean;
}

const STAGE_OPTIONS: Array<{ value: PartnerStage; label: string }> = [
  { value: 'NEW_LEAD', label: 'New lead' },
  { value: 'RESEARCHED', label: 'Researched' },
  { value: 'INITIAL_CONTACT', label: 'Initial contact' },
  { value: 'MEETING_SCHEDULED', label: 'Meeting scheduled' },
  { value: 'IN_CONVERSATION', label: 'In conversation' },
  { value: 'PROPOSAL_SENT', label: 'Proposal sent' },
  { value: 'ACTIVATED', label: 'Activated' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const OFFSET_PRESETS: Array<{ label: string; hours: number }> = [
  { label: '+0h (immediately)', hours: 0 },
  { label: '+1h', hours: 1 },
  { label: '+4h', hours: 4 },
  { label: '+1 day', hours: 24 },
  { label: '+3 days', hours: 72 },
  { label: '+7 days', hours: 168 },
  { label: '+14 days', hours: 336 },
];

const DEFAULT_FORM: CadenceInput = {
  name: '',
  triggerStage: 'MEETING_SCHEDULED',
  steps: [],
  active: true,
};

export function NewCadenceButton({ templates }: { templates: TemplateOption[] }) {
  return <CadenceDrawer templates={templates} triggerStyle="primary" />;
}

export function CadenceRowActions({
  cadence,
  templates,
}: {
  cadence: ExistingCadence;
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onArchive() {
    if (
      !confirm(`Archive "${cadence.name}"? In-flight sends keep running; no new ones will start.`)
    )
      return;
    startTransition(async () => {
      try {
        await archiveCadence(cadence.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }
  function onRestore() {
    startTransition(async () => {
      try {
        await restoreCadence(cadence.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <CadenceDrawer initial={cadence} templates={templates} triggerStyle="ghost" />
      {cadence.active ? (
        <button
          type="button"
          onClick={onArchive}
          disabled={isPending}
          title="Archive"
          className="rounded p-1.5 text-gray-400 transition hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onRestore}
          disabled={isPending}
          title="Restore"
          className="rounded p-1.5 text-gray-400 transition hover:bg-green-50 hover:text-green-600 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function CadenceDrawer({
  initial,
  templates,
  triggerStyle = 'primary',
}: {
  initial?: ExistingCadence;
  templates: TemplateOption[];
  triggerStyle?: 'primary' | 'ghost';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CadenceInput>(() => initialFormFor(initial));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEdit = Boolean(initial);

  const activeTemplates = useMemo(() => templates.filter((t) => t.active), [templates]);
  const previewSteps = useMemo(
    () => [...form.steps].sort((a, b) => a.offsetHours - b.offsetHours),
    [form.steps],
  );

  function onOpen() {
    setForm(initialFormFor(initial));
    setError(null);
    setOpen(true);
  }

  function addStep() {
    const firstTemplate = activeTemplates[0];
    setForm({
      ...form,
      steps: [
        ...form.steps,
        {
          offsetHours:
            form.steps.length === 0 ? 0 : form.steps[form.steps.length - 1]!.offsetHours + 24,
          kind: firstTemplate?.kind ?? 'EMAIL',
          templateId: firstTemplate?.id ?? '',
          requireApproval: false,
        },
      ],
    });
  }

  function updateStep(idx: number, patch: Partial<CadenceStepInput>) {
    const next = [...form.steps];
    next[idx] = { ...next[idx]!, ...patch };
    // If kind changed, default templateId to first template matching new kind
    if (patch.kind && next[idx]!.templateId) {
      const currentTemplate = templates.find((t) => t.id === next[idx]!.templateId);
      if (!currentTemplate || currentTemplate.kind !== patch.kind) {
        const firstMatch = activeTemplates.find((t) => t.kind === patch.kind);
        next[idx]!.templateId = firstMatch?.id ?? '';
      }
    }
    setForm({ ...form, steps: next });
  }

  function removeStep(idx: number) {
    const next = [...form.steps];
    next.splice(idx, 1);
    setForm({ ...form, steps: next });
  }

  function onSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && initial) {
          await updateCadence(initial.id, form);
        } else {
          await createCadence(form);
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

  return (
    <>
      {triggerStyle === 'ghost' ? (
        <button
          type="button"
          onClick={onOpen}
          title="Edit follow-up"
          className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button onClick={onOpen}>
          <Plus className="h-4 w-4" /> New AI Follow-Up
        </Button>
      )}

      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? `Edit "${initial?.name}"` : 'New AI Follow-Up'}
        width="720px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => onSubmit()}
              loading={isPending}
              disabled={form.steps.length === 0}
            >
              {isEdit ? 'Save changes' : 'Create AI Follow-Up'}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Post-meeting 3-day follow-up"
                autoFocus
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Fires when partner enters stage" required>
              <select
                value={form.triggerStage}
                onChange={(e) => setForm({ ...form, triggerStage: e.target.value as PartnerStage })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {STAGE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="rounded"
            />
            Active
            <span className="text-[11px] text-gray-400">
              Inactive Follow-Ups stop picking up new partners.
            </span>
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
                Steps
              </div>
              <Button variant="secondary" size="sm" onClick={addStep} type="button">
                <Plus className="h-3.5 w-3.5" /> Add step
              </Button>
            </div>

            {form.steps.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-xs text-gray-500">
                No steps yet. A Follow-Up needs at least one step to fire.
              </div>
            ) : (
              <div className="space-y-2">
                {form.steps.map((step, idx) => {
                  const matching = activeTemplates.filter((t) => t.kind === step.kind);
                  return (
                    <div key={idx} className="rounded-md border border-card-border bg-white p-3">
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-2 h-4 w-4 text-gray-300" />
                        <div className="grid flex-1 grid-cols-[110px_90px_1fr_auto] items-end gap-2">
                          <Field label="Offset">
                            <select
                              value={presetValueFor(step.offsetHours)}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === 'custom') return;
                                updateStep(idx, { offsetHours: Number(v) });
                              }}
                              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
                            >
                              {OFFSET_PRESETS.map((p) => (
                                <option key={p.hours} value={p.hours}>
                                  {p.label}
                                </option>
                              ))}
                              <option value="custom">Custom…</option>
                            </select>
                          </Field>
                          <Field label="Hours">
                            <input
                              type="number"
                              min={0}
                              value={step.offsetHours}
                              onChange={(e) =>
                                updateStep(idx, {
                                  offsetHours: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
                            />
                          </Field>
                          <Field label="Template">
                            <div className="flex gap-2">
                              <select
                                value={step.kind}
                                onChange={(e) =>
                                  updateStep(idx, { kind: e.target.value as MessageKind })
                                }
                                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
                              >
                                <option value="EMAIL">Email</option>
                                <option value="SMS">SMS</option>
                              </select>
                              <select
                                value={step.templateId}
                                onChange={(e) => updateStep(idx, { templateId: e.target.value })}
                                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
                              >
                                <option value="">— Pick a template —</option>
                                {matching.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </Field>
                          <button
                            type="button"
                            onClick={() => removeStep(idx)}
                            title="Remove step"
                            className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <label className="ml-6 mt-2 flex items-center gap-2 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={step.requireApproval}
                          onChange={(e) => updateStep(idx, { requireApproval: e.target.checked })}
                          className="rounded"
                        />
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                        Require approval before sending
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline preview */}
          {previewSteps.length > 0 && (
            <div className="rounded-md border border-card-border bg-gray-50 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-label text-gray-500">
                Timeline preview
              </div>
              <ol className="space-y-1 text-xs">
                {previewSteps.map((step, i) => {
                  const t = templates.find((x) => x.id === step.templateId);
                  return (
                    <li key={i} className="flex items-center gap-2 text-gray-700">
                      <Clock className="h-3 w-3 text-gray-400" />
                      <span className="font-mono text-[11px] text-gray-500">
                        {formatOffset(step.offsetHours)}
                      </span>
                      <span>·</span>
                      <span className="font-medium">{step.kind}</span>
                      <span>·</span>
                      <span className="text-gray-900">
                        {t ? t.name : <span className="text-red-600">No template picked</span>}
                      </span>
                      {step.requireApproval && (
                        <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          <ShieldCheck className="h-3 w-3" /> needs approval
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </form>
      </DrawerModal>
    </>
  );
}

function initialFormFor(initial?: ExistingCadence): CadenceInput {
  if (!initial) return DEFAULT_FORM;
  return {
    name: initial.name,
    triggerStage: initial.triggerStage,
    active: initial.active,
    steps: initial.steps,
  };
}

function presetValueFor(hours: number): string {
  return OFFSET_PRESETS.some((p) => p.hours === hours) ? String(hours) : 'custom';
}

function formatOffset(hours: number): string {
  if (hours === 0) return 'T+0';
  if (hours < 24) return `T+${hours}h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h === 0 ? `T+${d}d` : `T+${d}d ${h}h`;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
