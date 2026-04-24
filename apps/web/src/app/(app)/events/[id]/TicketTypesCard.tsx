'use client';

/**
 * Ticket type manager — lives in the Overview column.
 *
 * Rule: exactly ONE primary ticket per event. The server enforces it,
 * but we also hide the "Primary" option here if one already exists
 * so users don't bump into the error.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Pill } from '@partnerradar/ui';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { createTicketType, updateTicketType, deleteTicketType } from '../actions';

interface TicketType {
  id: string;
  name: string;
  kind: 'PRIMARY' | 'DEPENDENT';
  capacity: number;
  isPrimary: boolean;
  description: string | null;
}

interface Event {
  id: string;
  ticketTypes: TicketType[];
  canceledAt: Date | null;
}

export function TicketTypesCard({ event, canEdit }: { event: Event; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const hasPrimary = event.ticketTypes.some((t) => t.isPrimary);

  return (
    <Card
      title={
        <span className="flex items-center justify-between">
          <span>Tickets</span>
          {canEdit && !event.canceledAt && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 rounded-md border border-dashed border-primary bg-white px-2 py-1 text-[11px] font-medium text-primary transition hover:bg-blue-50"
            >
              <Plus className="h-3 w-3" /> Add ticket
            </button>
          )}
        </span>
      }
    >
      <div className="space-y-2">
        {event.ticketTypes.map((t) => (
          <TicketRow
            key={t.id}
            eventId={event.id}
            ticket={t}
            canEdit={canEdit && !event.canceledAt}
          />
        ))}
        {event.ticketTypes.length === 0 && !adding && (
          <p className="text-xs text-gray-500">
            No tickets yet. Every event needs at least a primary ticket to send invites.
          </p>
        )}
        {adding && (
          <TicketForm
            eventId={event.id}
            onDone={() => setAdding(false)}
            allowPrimary={!hasPrimary}
          />
        )}
      </div>
    </Card>
  );
}

function TicketRow({
  eventId,
  ticket,
  canEdit,
}: {
  eventId: string;
  ticket: TicketType;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`Delete "${ticket.name}"? This only works if nobody's been assigned to it.`))
      return;
    startTransition(async () => {
      try {
        await deleteTicketType(eventId, ticket.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  if (editing) {
    return (
      <TicketForm
        eventId={eventId}
        initial={ticket}
        onDone={() => setEditing(false)}
        allowPrimary={false} // can't flip kind post-create
      />
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-card-border bg-white p-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{ticket.name}</span>
          {ticket.isPrimary && (
            <Pill color="#6366f1" tone="soft">
              Primary
            </Pill>
          )}
        </div>
        <div className="text-[11px] text-gray-500">
          Capacity {ticket.capacity}
          {ticket.description ? ` · ${ticket.description}` : ''}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending || ticket.isPrimary}
            title={ticket.isPrimary ? 'Primary ticket — delete the event instead' : 'Delete'}
            className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function TicketForm({
  eventId,
  initial,
  allowPrimary,
  onDone,
}: {
  eventId: string;
  initial?: TicketType;
  allowPrimary: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<'PRIMARY' | 'DEPENDENT'>(
    initial?.kind ?? (allowPrimary ? 'PRIMARY' : 'DEPENDENT'),
  );
  const [capacity, setCapacity] = useState(initial?.capacity ?? 20);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name required');
      return;
    }
    startTransition(async () => {
      try {
        if (initial) {
          await updateTicketType(eventId, initial.id, { name, capacity, description });
        } else {
          await createTicketType(eventId, { name, kind, capacity, description });
        }
        onDone();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-2 rounded-md border border-primary/40 bg-blue-50/30 p-2"
    >
      <div className="grid grid-cols-[1fr_100px] gap-2">
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ticket name (Game Seat, Dinner, Parking)"
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value) || 0)}
          placeholder="Qty"
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      {!initial && (
        <div className="flex items-center gap-2 text-[11px]">
          <label className="flex items-center gap-1 text-gray-600">
            <input
              type="radio"
              name="kind"
              checked={kind === 'PRIMARY'}
              disabled={!allowPrimary}
              onChange={() => setKind('PRIMARY')}
            />
            Primary
          </label>
          <label className="flex items-center gap-1 text-gray-600">
            <input
              type="radio"
              name="kind"
              checked={kind === 'DEPENDENT'}
              onChange={() => setKind('DEPENDENT')}
            />
            Dependent (requires primary)
          </label>
        </div>
      )}
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional description — e.g. 'with in-suite food + drink'"
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
      />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex items-center justify-end gap-1">
        <Button variant="secondary" size="sm" type="button" onClick={onDone}>
          <X className="h-3 w-3" /> Cancel
        </Button>
        <Button size="sm" onClick={() => onSubmit()} loading={isPending}>
          <Save className="h-3 w-3" /> {initial ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  );
}
