'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Pill, DrawerModal } from '@partnerradar/ui';
import { Plus, Trash2, Clock } from 'lucide-react';
import { createSubEvent, deleteSubEvent, type SubEventInput } from './host-actions';

interface TicketType {
  id: string;
  name: string;
  isPrimary: boolean;
}

interface SubEvent {
  id: string;
  kind: SubEventInput['kind'];
  name: string;
  venueName: string | null;
  venueAddress: string | null;
  startsAt: Date;
  endsAt: Date;
  invitationScope: SubEventInput['invitationScope'];
  dependentTicketTypeId: string | null;
}

interface Event {
  id: string;
  timezone: string;
  ticketTypes: TicketType[];
  subEvents: SubEvent[];
  canceledAt: Date | null;
}

const KINDS: Array<{ value: SubEventInput['kind']; label: string }> = [
  { value: 'SETUP', label: 'Setup' },
  { value: 'PRE_EVENT', label: 'Pre-event' },
  { value: 'DINNER', label: 'Dinner' },
  { value: 'MAIN', label: 'Main' },
  { value: 'POST_EVENT', label: 'Post-event' },
  { value: 'TEARDOWN', label: 'Teardown' },
  { value: 'CUSTOM', label: 'Custom' },
];

export function SubEventsTab({ event, canEdit }: { event: Event; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SubEventInput>({
    kind: 'SETUP',
    name: 'Setup',
    startsAt: defaultPre(event).start,
    endsAt: defaultPre(event).end,
    invitationScope: 'INTERNAL_ONLY',
    dependentTicketTypeId: null,
  });
  const [error, setError] = useState<string | null>(null);

  function onCreate() {
    setError(null);
    startTransition(async () => {
      try {
        await createSubEvent(event.id, {
          ...form,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
        });
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm('Delete this sub-event?')) return;
    startTransition(async () => {
      try {
        await deleteSubEvent(event.id, id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  const ticketById = new Map(event.ticketTypes.map((t) => [t.id, t]));
  const dependentTickets = event.ticketTypes.filter((t) => !t.isPrimary);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl rounded-lg border border-card-border bg-white">
        <header className="flex items-center justify-between border-b border-card-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Sub-events</h2>
            <p className="text-[11px] text-gray-500">
              Calendar-worthy related times — Setup, Pre-Dinner, Teardown. Each gets its own
              reminder schedule + visibility.
            </p>
          </div>
          {canEdit && !event.canceledAt && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add sub-event
            </Button>
          )}
        </header>

        {event.subEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500">
            No sub-events yet. Perfect for "Setup 2 hours before, internal only" or "Pre-dinner for
            dinner ticket holders."
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {event.subEvents.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Pill color="#6366f1" tone="soft">
                  {KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}
                </Pill>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">{s.name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    <Clock className="h-3 w-3" />
                    {formatWhen(s.startsAt, event.timezone)} –{' '}
                    {formatTime(s.endsAt, event.timezone)}
                    <span>·</span>
                    <span>
                      {s.invitationScope === 'INTERNAL_ONLY' && 'Internal only'}
                      {s.invitationScope === 'ALL_CONFIRMED' && 'All confirmed attendees'}
                      {s.invitationScope === 'DEPENDENT_TICKET_HOLDERS' &&
                        `Holders of ${ticketById.get(s.dependentTicketTypeId ?? '')?.name ?? 'ticket'}`}
                      {s.invitationScope === 'CUSTOM' && 'Custom scope'}
                    </span>
                  </div>
                </div>
                {canEdit && !event.canceledAt && (
                  <button
                    type="button"
                    onClick={() => onDelete(s.id)}
                    disabled={isPending}
                    title="Delete"
                    className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title="New sub-event"
        width="480px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onCreate} loading={isPending} disabled={!form.name.trim()}>
              Create sub-event
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <select
                value={form.kind}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kind: e.target.value as SubEventInput['kind'],
                    name:
                      KINDS.find((k) => k.value === (e.target.value as SubEventInput['kind']))
                        ?.label ?? form.name,
                  })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Display name">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Ends">
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
          </div>
          <Field label="Who's invited">
            <select
              value={form.invitationScope}
              onChange={(e) =>
                setForm({
                  ...form,
                  invitationScope: e.target.value as SubEventInput['invitationScope'],
                })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="INTERNAL_ONLY">Internal only (hosts)</option>
              <option value="ALL_CONFIRMED">All confirmed attendees</option>
              <option value="DEPENDENT_TICKET_HOLDERS">Holders of specific ticket type</option>
              <option value="CUSTOM">Custom (pick later)</option>
            </select>
          </Field>
          {form.invitationScope === 'DEPENDENT_TICKET_HOLDERS' && (
            <Field label="Which ticket type">
              <select
                value={form.dependentTicketTypeId ?? ''}
                onChange={(e) =>
                  setForm({ ...form, dependentTicketTypeId: e.target.value || null })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">— pick —</option>
                {dependentTickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Venue (optional, defaults to main venue)">
            <input
              type="text"
              value={form.venueName ?? ''}
              onChange={(e) => setForm({ ...form, venueName: e.target.value })}
              placeholder="The Chop House"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </DrawerModal>
    </div>
  );
}

function defaultPre(event: Event): { start: string; end: string } {
  // Default: 2 hours before event starts, lasting 2 hours.
  const start = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
  start.setHours(17, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  void event;
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatWhen(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
function formatTime(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
