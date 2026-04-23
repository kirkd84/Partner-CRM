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
  const [isPrimary, setIsPrimary] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await createContact(partnerId, { name, title, email, phone, isPrimary });
      setName('');
      setTitle('');
      setEmail('');
      setPhone('');
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startsAt || !endsAt) return;
    startTransition(async () => {
      await createAppointment(partnerId, {
        type: typeName,
        title,
        location,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
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
            <Button
              onClick={onSubmit}
              loading={isPending}
              disabled={!title.trim() || !startsAt || !endsAt}
            >
              Save
            </Button>
          </>
        }
      >
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
