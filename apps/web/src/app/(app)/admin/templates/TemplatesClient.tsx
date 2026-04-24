'use client';

/**
 * Client island for /admin/templates.
 *
 * The drawer has:
 *   • Name + kind + stage metadata
 *   • Subject (email only)
 *   • Body editor with a variable palette
 *   • Live preview panel that swaps {{tokens}} for sample values
 *   • Length meter for SMS
 *
 * Clicking a variable chip inserts the token at the current cursor
 * position — same behaviour reps expect from any email-editor they've
 * used.
 */

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Pencil, Plus, Archive, RotateCcw, Trash2, Copy } from 'lucide-react';
import {
  createTemplate,
  updateTemplate,
  archiveTemplate,
  restoreTemplate,
  deleteTemplate,
  type TemplateInput,
  type MessageKind,
  type PartnerStage,
} from './actions';
import { TEMPLATE_VARIABLES, sampleContext, substitute } from './substitute';

interface ExistingTemplate {
  id: string;
  kind: MessageKind;
  name: string;
  subject: string | null;
  body: string;
  stage: PartnerStage | null;
  active: boolean;
}

const DEFAULT_FORM: TemplateInput = {
  kind: 'EMAIL',
  name: '',
  subject: '',
  body: '',
  stage: null,
  active: true,
};

const SMS_MAX = 320;

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

export function NewTemplateButton() {
  return <TemplateDrawer triggerStyle="primary" />;
}

export function TemplateRowActions({ template }: { template: ExistingTemplate }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onArchive() {
    if (
      !confirm(
        `Archive "${template.name}"? It stays referenceable by cadences but won't show up in the picker.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await archiveTemplate(template.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }
  function onRestore() {
    startTransition(async () => {
      try {
        await restoreTemplate(template.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }
  function onDelete() {
    if (
      !confirm(
        `Permanently delete "${template.name}"? This only works if no active cadence references it.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await deleteTemplate(template.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <TemplateDrawer initial={template} triggerStyle="ghost" />
      <TemplateDrawer initial={template} triggerStyle="duplicate" />
      {template.active ? (
        <button
          type="button"
          onClick={onArchive}
          disabled={isPending}
          title="Archive — hides from new message picker"
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
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        title="Delete permanently"
        className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TemplateDrawer({
  initial,
  triggerStyle = 'primary',
}: {
  initial?: ExistingTemplate;
  triggerStyle?: 'primary' | 'ghost' | 'duplicate';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TemplateInput>(() => initialFormFor(initial, triggerStyle));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const [focusTarget, setFocusTarget] = useState<'body' | 'subject'>('body');

  // "Duplicate" always creates a new row from an existing row.
  const isEdit = Boolean(initial) && triggerStyle !== 'duplicate';

  const preview = useMemo(() => {
    const ctx = sampleContext();
    return {
      subject: substitute(form.subject ?? '', ctx),
      body: substitute(form.body ?? '', ctx),
    };
  }, [form.subject, form.body]);

  function onOpen() {
    setForm(initialFormFor(initial, triggerStyle));
    setError(null);
    setOpen(true);
  }

  function insertToken(token: string) {
    const wrap = `{{${token}}}`;
    if (focusTarget === 'subject' && form.kind === 'EMAIL') {
      const input = subjectRef.current;
      const cur = form.subject ?? '';
      if (!input) {
        setForm({ ...form, subject: cur + wrap });
        return;
      }
      const start = input.selectionStart ?? cur.length;
      const end = input.selectionEnd ?? cur.length;
      const next = cur.slice(0, start) + wrap + cur.slice(end);
      setForm({ ...form, subject: next });
      requestAnimationFrame(() => {
        input.focus();
        const pos = start + wrap.length;
        input.setSelectionRange(pos, pos);
      });
      return;
    }
    const ta = bodyRef.current;
    const cur = form.body ?? '';
    if (!ta) {
      setForm({ ...form, body: cur + wrap });
      return;
    }
    const start = ta.selectionStart ?? cur.length;
    const end = ta.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + wrap + cur.slice(end);
    setForm({ ...form, body: next });
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + wrap.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function onSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && initial) {
          await updateTemplate(initial.id, form);
        } else {
          await createTemplate(form);
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

  const smsLength = form.body.length;
  const smsOver = form.kind === 'SMS' && smsLength > SMS_MAX;

  return (
    <>
      {triggerStyle === 'ghost' ? (
        <button
          type="button"
          onClick={onOpen}
          title="Edit template"
          className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : triggerStyle === 'duplicate' ? (
        <button
          type="button"
          onClick={onOpen}
          title="Duplicate"
          className="rounded p-1.5 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button onClick={onOpen}>
          <Plus className="h-4 w-4" /> New template
        </Button>
      )}

      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title={
          isEdit
            ? `Edit "${initial?.name}"`
            : triggerStyle === 'duplicate'
              ? `Duplicate "${initial?.name}"`
              : 'New message template'
        }
        width="720px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => onSubmit()} loading={isPending} disabled={smsOver}>
              {isEdit ? 'Save changes' : 'Save template'}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
          {/* Left — editor */}
          <div className="space-y-4">
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <Field label="Kind">
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as MessageKind })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="EMAIL">Email</option>
                  <option value="SMS">SMS</option>
                </select>
              </Field>
              <Field label="Name" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Post-pitch follow-up"
                  autoFocus
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </Field>
            </div>

            <Field label="Triggers on stage (optional)">
              <select
                value={form.stage ?? ''}
                onChange={(e) =>
                  setForm({ ...form, stage: (e.target.value || null) as PartnerStage | null })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Any stage</option>
                {STAGE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">
                Cadences filter the picker by stage so reps see the right templates first.
              </p>
            </Field>

            {form.kind === 'EMAIL' && (
              <Field label="Subject" required>
                <input
                  ref={subjectRef}
                  type="text"
                  value={form.subject ?? ''}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  onFocus={() => setFocusTarget('subject')}
                  placeholder="e.g. Quick follow-up from {{rep_first_name}}"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </Field>
            )}

            <Field label="Body" required>
              <textarea
                ref={bodyRef}
                rows={form.kind === 'SMS' ? 6 : 12}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                onFocus={() => setFocusTarget('body')}
                placeholder={
                  form.kind === 'EMAIL'
                    ? 'Hi {{contact_first_name}},\n\nNice meeting you yesterday — just following up on what we talked about for {{partner_name}}.\n\n— {{rep_first_name}}'
                    : 'Hi {{contact_first_name}}, it was great meeting yesterday. Feel free to text me back any time — {{rep_first_name}}'
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {form.kind === 'SMS' && (
                <p
                  className={`mt-1 text-[11px] ${
                    smsOver ? 'font-semibold text-red-600' : 'text-gray-400'
                  }`}
                >
                  {smsLength}/{SMS_MAX} characters
                  {smsOver ? ' — too long, will fragment across carriers' : ''}
                </p>
              )}
            </Field>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded"
              />
              Active
              <span className="text-[11px] text-gray-400">
                Inactive templates stay in the DB but disappear from the picker.
              </span>
            </label>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Right — variable palette + preview */}
          <div className="space-y-4 rounded-md border border-card-border bg-gray-50 p-3">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-label text-gray-500">
                Variables
              </div>
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertToken(v.token)}
                    title={v.label}
                    className="rounded-md border border-gray-300 bg-white px-2 py-0.5 font-mono text-[11px] text-gray-700 transition hover:border-primary hover:text-primary"
                  >
                    {'{{'}
                    {v.token}
                    {'}}'}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Click a chip to insert it at the cursor. Missing values fall back to blank.
              </p>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-label text-gray-500">
                Preview
              </div>
              {form.kind === 'EMAIL' && (
                <div className="mb-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs">
                  <div className="text-gray-400">Subject</div>
                  <div className="text-gray-900">
                    {preview.subject.output || <span className="text-gray-300">—</span>}
                  </div>
                </div>
              )}
              <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900">
                <pre className="whitespace-pre-wrap break-words font-sans">
                  {preview.body.output || <span className="text-gray-300">—</span>}
                </pre>
              </div>
              {(preview.body.missing.length > 0 || preview.subject.missing.length > 0) && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                  Missing sample values for:{' '}
                  {[...new Set([...preview.subject.missing, ...preview.body.missing])].join(', ')}
                </div>
              )}
              {(preview.body.unknown.length > 0 || preview.subject.unknown.length > 0) && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                  Unknown variables (likely typo):{' '}
                  {[...new Set([...preview.subject.unknown, ...preview.body.unknown])].join(', ')}
                </div>
              )}
            </div>
          </div>
        </form>
      </DrawerModal>
    </>
  );
}

function initialFormFor(
  initial?: ExistingTemplate,
  triggerStyle?: 'primary' | 'ghost' | 'duplicate',
): TemplateInput {
  if (!initial) return DEFAULT_FORM;
  return {
    kind: initial.kind,
    name: triggerStyle === 'duplicate' ? `${initial.name} (copy)` : initial.name,
    subject: initial.subject ?? '',
    body: initial.body,
    stage: initial.stage,
    active: triggerStyle === 'duplicate' ? true : initial.active,
  };
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
