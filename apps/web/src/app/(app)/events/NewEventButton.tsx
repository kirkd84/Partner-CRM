'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Plus } from 'lucide-react';
import { createEvent } from './actions';

interface Market {
  id: string;
  name: string;
  timezone: string;
}

export function NewEventButton({ markets }: { markets: Market[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStart());
  const [endsAt, setEndsAt] = useState(defaultEnd());
  const [visibility, setVisibility] = useState<'PRIVATE' | 'MARKET_WIDE'>('PRIVATE');
  const [primaryTicketName, setPrimaryTicketName] = useState('General Admission');
  const [primaryTicketCapacity, setPrimaryTicketCapacity] = useState(20);

  const selectedMarket = markets.find((m) => m.id === marketId);

  function onOpen() {
    if (markets.length === 0) return;
    setMarketId(markets[0]!.id);
    setName('');
    setDescription('');
    setVenueName('');
    setVenueAddress('');
    setStartsAt(defaultStart());
    setEndsAt(defaultEnd());
    setVisibility('PRIVATE');
    setPrimaryTicketName('General Admission');
    setPrimaryTicketCapacity(20);
    setError(null);
    setOpen(true);
  }

  function onSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Give your event a name');
      return;
    }
    if (!marketId) {
      setError('Pick a market');
      return;
    }
    startTransition(async () => {
      try {
        const result = await createEvent({
          name: name.trim(),
          description: description.trim() || undefined,
          venueName: venueName.trim() || undefined,
          venueAddress: venueAddress.trim() || undefined,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          timezone: selectedMarket?.timezone ?? 'America/Denver',
          marketId,
          visibility,
          primaryTicketName: primaryTicketName.trim() || undefined,
          primaryTicketCapacity: primaryTicketCapacity > 0 ? primaryTicketCapacity : undefined,
        });
        setOpen(false);
        router.push(`/events/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create event');
      }
    });
  }

  return (
    <>
      <Button onClick={onOpen} disabled={markets.length === 0}>
        <Plus className="h-4 w-4" /> New event
      </Button>
      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title="New event"
        width="560px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => onSubmit()} loading={isPending} disabled={!name.trim()}>
              Create event
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Name" required>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nuggets Suite Night — April 25"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>

          <Field label="Market" required>
            <select
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {selectedMarket && (
              <p className="mt-1 text-[11px] text-gray-400">Timezone: {selectedMarket.timezone}</p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" required>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Ends" required>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
          </div>

          <Field label="Venue name (optional)">
            <input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="Ball Arena, The Chop House"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>

          <Field label="Venue address (optional)">
            <input
              type="text"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              placeholder="1000 Chopper Cir, Denver, CO 80204"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dress code, parking notes, anything attendees need to know"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>

          <fieldset className="rounded-md border border-card-border bg-gray-50 p-3">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-label text-gray-500">
              Primary ticket
            </legend>
            <p className="mb-2 text-[11px] text-gray-500">
              Every event needs one primary ticket type. You can add dependent tickets (Dinner,
              Parking) from the event detail page.
            </p>
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <input
                type="text"
                value={primaryTicketName}
                onChange={(e) => setPrimaryTicketName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Game Seat"
              />
              <input
                type="number"
                min={1}
                value={primaryTicketCapacity}
                onChange={(e) => setPrimaryTicketCapacity(Number(e.target.value) || 0)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Capacity"
              />
            </div>
          </fieldset>

          <Field label="Visibility">
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'PRIVATE' | 'MARKET_WIDE')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="PRIVATE">Private — just the hosts and market managers</option>
              <option value="MARKET_WIDE">Market-wide — any rep in this market can see it</option>
            </select>
          </Field>

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

function defaultStart(): string {
  // Tomorrow at 7pm — easy to nudge.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return toLocalInput(d);
}
function defaultEnd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(22, 0, 0, 0);
  return toLocalInput(d);
}
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
