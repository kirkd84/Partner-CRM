'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Plus, Trash2, Star } from 'lucide-react';
import {
  createContact,
  setPrimaryContact,
  deleteContact,
  createTask,
  completeTask,
  createAppointment,
  createEvent,
} from './actions';

/**
 * Dashed-blue "+ New contact" button + drawer form.
 * SPEC §3.13 dashed variant.
 */
export function NewContactButton({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthMonth, setBirthMonth] = useState<string>('');
  const [birthDay, setBirthDay] = useState<string>('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await createContact(partnerId, {
        name,
        title,
        email,
        phone,
        isPrimary,
        birthMonth: birthMonth ? parseInt(birthMonth, 10) : null,
        birthDay: birthDay ? parseInt(birthDay, 10) : null,
      });
      setName('');
      setTitle('');
      setEmail('');
      setPhone('');
      setBirthMonth('');
      setBirthDay('');
      setIsPrimary(false);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-blue-500 bg-transparent px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
      >
        <Plus className="h-3.5 w-3.5" /> New contact
      </button>
      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title="New contact"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={isPending} disabled={!name.trim()}>
              Add contact
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Broker, Owner, Agent…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 555 5555"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Birthday (month + day, optional)">
            <div className="flex gap-2">
              <select
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">— Month —</option>
                {[
                  'Jan',
                  'Feb',
                  'Mar',
                  'Apr',
                  'May',
                  'Jun',
                  'Jul',
                  'Aug',
                  'Sep',
                  'Oct',
                  'Nov',
                  'Dec',
                ].map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={31}
                value={birthDay}
                onChange={(e) => setBirthDay(e.target.value)}
                placeholder="Day"
                className="w-24 rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <p className="mt-1 text-[10.5px] text-gray-500">
              Year is intentionally omitted. Birthdays drive the touchpoints reminder list.
            </p>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="rounded"
            />
            Mark as primary contact
          </label>
        </form>
      </DrawerModal>
    </>
  );
}

export function ContactRowActions({
  partnerId,
  contactId,
  isPrimary,
}: {
  partnerId: string;
  contactId: string;
  isPrimary: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSetPrimary() {
    if (isPrimary) return;
    startTransition(async () => {
      await setPrimaryContact(partnerId, contactId);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm('Delete this contact?')) return;
    startTransition(async () => {
      await deleteContact(partnerId, contactId);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      {!isPrimary && (
        <button
          type="button"
          onClick={onSetPrimary}
          disabled={isPending}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-amber-600"
          aria-label="Mark as primary"
          title="Mark primary"
        >
          <Star className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
        aria-label="Delete contact"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** "+ New task" dashed button + drawer */
export function NewTaskButton({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      await createTask(partnerId, {
        title,
        description,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        priority,
      });
      setTitle('');
      setDescription('');
      setDueAt('');
      setPriority('NORMAL');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-blue-500 bg-transparent px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
      >
        <Plus className="h-3.5 w-3.5" /> New task
      </button>
      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title="New task"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={isPending} disabled={!title.trim()}>
              Create task
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Title" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due">
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT')
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </Field>
          </div>
        </form>
      </DrawerModal>
    </>
  );
}

interface AppointmentTypeOption {
  id: string;
  name: string;
  durationMinutes: number;
}

/** "+ New appointment" dashed button + drawer — admin-managed types. */
export function NewAppointmentButton({
  partnerId,
  appointmentTypes = [],
}: {
  partnerId: string;
  appointmentTypes?: AppointmentTypeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typeName, setTypeName] = useState(appointmentTypes[0]?.name ?? 'Meeting');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  /**
   * When the user picks a start time, auto-fill the end time using the
   * selected type's durationMinutes. Only if endsAt is currently empty
   * or still matches an earlier auto-fill.
   */
  function autoFillEndFrom(start: string) {
    const selectedType = appointmentTypes.find((t) => t.name === typeName);
    if (!selectedType || !start) return;
    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) return;
    const end = new Date(startDate.getTime() + selectedType.durationMinutes * 60_000);
    // datetime-local format: YYYY-MM-DDThh:mm
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
    setEndsAt(local);
  }

  const [conflicts, setConflicts] = useState<
    Array<{
      title: string;
      startsAt: string;
      endsAt: string;
      source: 'internal' | 'external';
      provider?: string;
    }>
  >([]);

  function doSave(force: boolean) {
    if (!title.trim() || !startsAt || !endsAt) return;
    startTransition(async () => {
      const result = await createAppointment(partnerId, {
        type: typeName,
        title,
        location,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        notes,
        force,
      });
      if (result.ok === false) {
        setConflicts(result.conflicts);
        return;
      }
      setTitle('');
      setLocation('');
      setStartsAt('');
      setEndsAt('');
      setNotes('');
      setConflicts([]);
      setOpen(false);
      router.refresh();
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSave(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-blue-500 bg-transparent px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
      >
        <Plus className="h-3.5 w-3.5" /> New appointment
      </button>
      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title="New appointment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {conflicts.length > 0 ? (
              <Button
                onClick={() => doSave(true)}
                loading={isPending}
                disabled={!title.trim() || !startsAt || !endsAt}
              >
                Save anyway
              </Button>
            ) : (
              <Button
                onClick={onSubmit}
                loading={isPending}
                disabled={!title.trim() || !startsAt || !endsAt}
              >
                Save
              </Button>
            )}
          </>
        }
      >
        {conflicts.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-semibold">
              {conflicts.length === 1
                ? 'Overlaps with another event'
                : `Overlaps with ${conflicts.length} other events`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {conflicts.slice(0, 3).map((c, i) => (
                <li key={i}>
                  • "{c.title}" —{' '}
                  {new Date(c.startsAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  –
                  {new Date(c.endsAt).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {c.source === 'external' && c.provider && (
                    <span className="ml-1 text-amber-700">({c.provider})</span>
                  )}
                </li>
              ))}
              {conflicts.length > 3 && (
                <li className="text-amber-700">+{conflicts.length - 3} more</li>
              )}
            </ul>
            <p className="mt-1 text-[11px] text-amber-700">
              Click "Save anyway" to book on top, or adjust the time.
            </p>
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Type">
            {appointmentTypes.length > 0 ? (
              <select
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {appointmentTypes.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name} ·{' '}
                    {t.durationMinutes < 60
                      ? `${t.durationMinutes}m`
                      : `${Math.round(t.durationMinutes / 60)}h`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                placeholder="e.g. Pitch, Follow-up, Coffee"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            )}
            {appointmentTypes.length === 0 && (
              <p className="mt-1 text-[11px] text-gray-400">
                No admin-managed types configured. An admin can set these up at Admin → Appointment
                types.
              </p>
            )}
          </Field>
          <Field label="Title" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Location">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Their office, a coffee shop, Zoom…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" required>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => {
                  setStartsAt(e.target.value);
                  // auto-fill end if it's empty using the type's duration
                  if (!endsAt) autoFillEndFrom(e.target.value);
                }}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Ends" required>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <p className="text-[11px] text-gray-400">
            Google / Apple / Storm calendar sync arrives in Phase 4.
          </p>
        </form>
      </DrawerModal>
    </>
  );
}

/** "+ New event" dashed button + drawer — group networking events */
export function NewEventButton({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('Chamber');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startsAt) return;
    startTransition(async () => {
      await createEvent(partnerId, {
        type,
        title,
        location,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        notes,
      });
      setTitle('');
      setLocation('');
      setStartsAt('');
      setEndsAt('');
      setNotes('');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-blue-500 bg-transparent px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
      >
        <Plus className="h-3.5 w-3.5" /> New event
      </button>
      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title="New event"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={isPending} disabled={!title.trim() || !startsAt}>
              Save
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option>Chamber</option>
              <option>Broker open</option>
              <option>Lunch-and-learn</option>
              <option>Mixer</option>
              <option>Conference</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Title" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
              placeholder="Wheat Ridge Chamber mixer"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Location">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Rocky Mountain Tap & Grill"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" required>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Ends">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Who should attend, talking points, follow-ups…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
        </form>
      </DrawerModal>
    </>
  );
}

/** Inline "check off" button for a task row. Optimistic via transition. */
export function TaskCheckbox({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function onClick() {
    if (done || isPending) return;
    setDone(true); // optimistic strike-through
    startTransition(async () => {
      try {
        await completeTask(taskId);
        router.refresh();
      } catch {
        setDone(false);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending || done}
      aria-label="Mark task complete"
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none transition ${
        done
          ? 'border-green-600 bg-green-600 text-white'
          : 'border-gray-300 bg-white text-transparent hover:border-primary hover:text-primary'
      }`}
    >
      ✓
    </button>
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

// ─── Expense drawer (Phase 6) ────────────────────────────────────────
import { createExpense } from './actions';
import { generateAIDraft as generateAIDraftAction, recordDraftAccepted } from './actions';
import { DollarSign, Sparkles, Copy as CopyIcon, Send, RefreshCw } from 'lucide-react';

const EXPENSE_CATEGORIES = ['Meal', 'Gift', 'Event', 'Travel', 'Other'] as const;

export function NewExpenseButton({
  partnerId,
  r2Configured,
}: {
  partnerId: string;
  r2Configured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof EXPENSE_CATEGORIES)[number]>('Meal');
  const [occurredOn, setOccurredOn] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<
    { kind: 'ok'; status: string; reason: string } | { kind: 'blocked'; reason: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !description.trim()) return;
    startTransition(async () => {
      try {
        const res = await createExpense(partnerId, {
          amount: amt,
          description,
          category,
          occurredOn: new Date(occurredOn).toISOString(),
        });
        if (!res.ok) {
          setResult({ kind: 'blocked', reason: res.reason });
          return;
        }
        setResult({ kind: 'ok', status: res.status, reason: res.reason });
        setAmount('');
        setDescription('');
        router.refresh();
      } catch (err) {
        setResult({
          kind: 'blocked',
          reason: err instanceof Error ? err.message : 'Failed',
        });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setResult(null);
        }}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-emerald-500 bg-transparent px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
      >
        <DollarSign className="h-3.5 w-3.5" /> Log expense
      </button>
      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title="Log expense"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              loading={isPending}
              disabled={!amount || !description.trim()}
            >
              Submit
            </Button>
          </>
        }
      >
        {result?.kind === 'ok' && (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            <strong>
              {result.status === 'AUTO_APPROVED' ? 'Auto-approved.' : 'Submitted for approval.'}
            </strong>{' '}
            {result.reason}
          </div>
        )}
        {result?.kind === 'blocked' && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <strong>Blocked.</strong> {result.reason}
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <Field label="Amount (USD)" required>
              <input
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
                placeholder="0.00"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Category" required>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof EXPENSE_CATEGORIES)[number])}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Description" required>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="e.g. Coffee at Stumptown with Alex"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Date" required>
            <input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Receipt">
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-center text-xs text-gray-500">
              {r2Configured ? (
                <>
                  Drag a receipt here, or{' '}
                  <button type="button" className="text-primary underline">
                    browse
                  </button>
                </>
              ) : (
                <>Receipt upload lights up once R2 storage is wired (Phase 6.1).</>
              )}
            </div>
          </Field>
          <p className="text-[11px] text-gray-400">
            Expenses under $25 auto-approve. Between $25–$100 go to a manager. Over $100 needs an
            admin. Admin can tune thresholds per market or per rep in Admin → Budget rules.
          </p>
        </form>
      </DrawerModal>
    </>
  );
}

// ─── AI Draft drawer (Phase 7) ───────────────────────────────────────

const AI_PURPOSES = [
  { value: 'first_outreach', label: 'First outreach' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'schedule_meeting', label: 'Schedule a meeting' },
  { value: 'post_meeting_thankyou', label: 'Post-meeting thank-you' },
  { value: 're_engagement', label: 'Re-engagement' },
  { value: 'custom', label: 'Custom' },
] as const;

type AIPurpose = (typeof AI_PURPOSES)[number]['value'];

export function AIDraftButton({
  partnerId,
  aiConfigured,
}: {
  partnerId: string;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [purpose, setPurpose] = useState<AIPurpose>('follow_up');
  const [context, setContext] = useState('');
  const [draft, setDraft] = useState<{
    subject?: string;
    body: string;
    model: string;
    isPlaceholder: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function doGenerate() {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await generateAIDraftAction(partnerId, {
          channel,
          purpose,
          contextNotes: context.trim() || undefined,
        });
        setDraft(res);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to generate');
      }
    });
  }

  function doAccept() {
    if (!draft) return;
    startTransition(async () => {
      try {
        await recordDraftAccepted(partnerId, {
          channel,
          subject: draft.subject,
          body: draft.body,
        });
        setOpen(false);
        setDraft(null);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to record');
      }
    });
  }

  function doCopy() {
    if (!draft) return;
    const text =
      channel === 'email' && draft.subject
        ? `Subject: ${draft.subject}\n\n${draft.body}`
        : draft.body;
    navigator.clipboard?.writeText(text);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDraft(null);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 transition hover:border-purple-300 hover:bg-purple-100"
      >
        <Sparkles className="h-3.5 w-3.5" /> Draft with AI
      </button>
      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title="Draft AI message"
        footer={
          draft ? (
            <>
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Start over
              </Button>
              <Button onClick={doCopy} variant="secondary">
                <CopyIcon className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button onClick={doGenerate} variant="secondary" loading={isPending}>
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
              <Button onClick={doAccept} loading={isPending}>
                <Send className="h-3.5 w-3.5" /> Accept & log
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={doGenerate} loading={isPending}>
                Generate draft
              </Button>
            </>
          )
        }
      >
        {!aiConfigured && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Using placeholder drafts.</strong> Real AI-written messages light up once
            ANTHROPIC_API_KEY is set in Railway. The UX below is the shape reps will see every day.
          </div>
        )}
        {err && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {err}
          </div>
        )}
        {!draft ? (
          <div className="space-y-3">
            <Field label="Channel">
              <div className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5">
                {(['email', 'sms'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={`flex-1 rounded px-3 py-1.5 text-xs font-semibold capitalize transition ${
                      channel === c ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {c === 'email' ? 'Email' : 'SMS'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Purpose">
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as AIPurpose)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {AI_PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Context notes (optional)">
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={4}
                placeholder="Anything the AI should know — a specific reason, a recent event they mentioned, a time window that works…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <p className="text-[11px] text-gray-400">
              We send the partner's company info, your recent touchpoints, and your tone profile to
              Claude Sonnet. You'll review the draft before anything goes out.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {channel === 'email' && (
              <Field label="Subject">
                <input
                  type="text"
                  value={draft.subject ?? ''}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </Field>
            )}
            <Field label="Message">
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={12}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <p className="text-[11px] text-gray-400">
              Model: <span className="font-mono">{draft.model}</span>
              {draft.isPlaceholder && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                  (placeholder — not from Claude)
                </span>
              )}
            </p>
          </div>
        )}
      </DrawerModal>
    </>
  );
}
