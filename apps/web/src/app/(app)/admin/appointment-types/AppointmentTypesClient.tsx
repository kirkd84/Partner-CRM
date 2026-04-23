'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Plus, Pencil, Archive, RotateCcw } from 'lucide-react';
import {
  createAppointmentType,
  updateAppointmentType,
  archiveAppointmentType,
  restoreAppointmentType,
  type AppointmentTypeInput,
} from './actions';

interface User {
  id: string;
  name: string;
  role: string;
}

interface ExistingType {
  id: string;
  name: string;
  durationMinutes: number;
  reminderMinutesBefore: number | null;
  alertIfUnassigned: boolean;
  alertUserId: string | null;
  archived: boolean;
}

type FormState = AppointmentTypeInput;

const DEFAULT_FORM: FormState = {
  name: '',
  durationMinutes: 30,
  reminderMinutesBefore: 60,
  alertIfUnassigned: false,
  alertUserId: null,
};

const REMINDER_PRESETS: Array<{ label: string; value: number | null }> = [
  { label: 'No reminder', value: null },
  { label: 'At start time', value: 0 },
  { label: '15 min before', value: 15 },
  { label: '30 min before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '2 hours before', value: 120 },
  { label: '1 day before', value: 1440 },
];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180];

export function AppointmentTypesToolbar({ users }: { users: User[] }) {
  return <TypeDrawerButton users={users} triggerStyle="primary" />;
}

export function AppointmentTypeRowActions({ type, users }: { type: ExistingType; users: User[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onArchive() {
    if (!confirm(`Archive "${type.name}"? It will no longer appear in the new-appointment picker.`))
      return;
    startTransition(async () => {
      try {
        await archiveAppointmentType(type.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onRestore() {
    startTransition(async () => {
      try {
        await restoreAppointmentType(type.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <TypeDrawerButton initial={type} users={users} triggerStyle="ghost" />
      {type.archived ? (
        <button
          type="button"
          onClick={onRestore}
          disabled={isPending}
          title="Restore — brings it back to the picker"
          className="rounded p-1.5 text-gray-400 transition hover:bg-green-50 hover:text-green-600 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onArchive}
          disabled={isPending}
          title="Archive — hides from new-appointment picker"
          className="rounded p-1.5 text-gray-400 transition hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function TypeDrawerButton({
  initial,
  users,
  triggerStyle = 'primary',
}: {
  initial?: ExistingType;
  users: User[];
  triggerStyle?: 'primary' | 'ghost';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          durationMinutes: initial.durationMinutes,
          reminderMinutesBefore: initial.reminderMinutesBefore,
          alertIfUnassigned: initial.alertIfUnassigned,
          alertUserId: initial.alertUserId,
        }
      : DEFAULT_FORM,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEdit = Boolean(initial);

  function onOpen() {
    setForm(
      initial
        ? {
            name: initial.name,
            durationMinutes: initial.durationMinutes,
            reminderMinutesBefore: initial.reminderMinutesBefore,
            alertIfUnassigned: initial.alertIfUnassigned,
            alertUserId: initial.alertUserId,
          }
        : DEFAULT_FORM,
    );
    setError(null);
    setOpen(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return;
    startTransition(async () => {
      try {
        if (isEdit && initial) {
          await updateAppointmentType(initial.id, form);
        } else {
          await createAppointmentType(form);
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <>
      {triggerStyle === 'ghost' ? (
        <button
          type="button"
          onClick={onOpen}
          className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
          title="Edit type"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button onClick={onOpen}>
          <Plus className="h-4 w-4" /> New type
        </Button>
      )}

      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? `Edit "${initial?.name}"` : 'New appointment type'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={isPending} disabled={!form.name.trim()}>
              {isEdit ? 'Save changes' : 'Create type'}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
              placeholder="e.g. Initial Inspection, Pitch, Coffee…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>

          <Field label="Duration (minutes)" required>
            <div className="flex flex-wrap gap-1">
              {DURATION_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm({ ...form, durationMinutes: p })}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    form.durationMinutes === p
                      ? 'border-primary bg-blue-50 text-primary'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p < 60
                    ? `${p}m`
                    : p % 60 === 0
                      ? `${p / 60}h`
                      : `${Math.floor(p / 60)}h ${p % 60}m`}
                </button>
              ))}
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={form.durationMinutes}
                onChange={(e) =>
                  setForm({ ...form, durationMinutes: parseInt(e.target.value, 10) || 30 })
                }
                className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              Used as the default length when a rep creates this type of appointment.
            </p>
          </Field>

          <Field label="Reminder to rep">
            <select
              value={form.reminderMinutesBefore === null ? '' : String(form.reminderMinutesBefore)}
              onChange={(e) =>
                setForm({
                  ...form,
                  reminderMinutesBefore:
                    e.target.value === '' ? null : parseInt(e.target.value, 10),
                })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {REMINDER_PRESETS.map((p) => (
                <option key={p.label} value={p.value === null ? '' : String(p.value)}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">
              Emails + push notifications fire in Phase 7 once Resend is wired. The schedule is
              stored now and will be honored automatically when the notifier ships.
            </p>
          </Field>

          <div className="rounded-md border border-card-border bg-gray-50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <input
                type="checkbox"
                checked={form.alertIfUnassigned}
                onChange={(e) => setForm({ ...form, alertIfUnassigned: e.target.checked })}
                className="rounded"
              />
              Alert when left unassigned
            </label>
            {form.alertIfUnassigned && (
              <div className="mt-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600">
                    Alert who?
                    <span className="ml-0.5 text-red-500">*</span>
                  </span>
                  <select
                    value={form.alertUserId ?? ''}
                    onChange={(e) => setForm({ ...form, alertUserId: e.target.value || null })}
                    required={form.alertIfUnassigned}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="">— Pick a user —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-1 text-[11px] text-gray-400">
                  They'll get a notification the moment an unassigned appointment of this type hits
                  the queue.
                </p>
              </div>
            )}
          </div>

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
