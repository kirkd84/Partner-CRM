'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Plus } from 'lucide-react';
import { createEvent } from './actions';
import { VenueAutocomplete } from './VenueAutocomplete';

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
  const [venueLat, setVenueLat] = useState<number | null>(null);
  const [venueLng, setVenueLng] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string>(defaultDate());
  const [startTime, setStartTime] = useState<string>('19:00');
  const [endDate, setEndDate] = useState<string>(defaultDate());
  const [endTime, setEndTime] = useState<string>('22:00');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'MARKET_WIDE' | 'HOST_ONLY'>('PRIVATE');
  const [primaryTicketName, setPrimaryTicketName] = useState('General Admission');
  // Blank by default — Kirk fills in capacity per-event. An empty string keeps
  // the input placeholder visible instead of a misleading pre-populated number.
  const [primaryTicketCapacity, setPrimaryTicketCapacity] = useState<string>('');

  const selectedMarket = markets.find((m) => m.id === marketId);

  function onOpen() {
    if (markets.length === 0) return;
    setMarketId(markets[0]!.id);
    setName('');
    setDescription('');
    setVenueName('');
    setVenueAddress('');
    setVenueLat(null);
    setVenueLng(null);
    const today = defaultDate();
    setStartDate(today);
    setStartTime('19:00');
    setEndDate(today);
    setEndTime('22:00');
    setVisibility('PRIVATE');
    setPrimaryTicketName('General Admission');
    setPrimaryTicketCapacity('');
    setError(null);
    setOpen(true);
  }

  function combine(date: string, time: string): string {
    return `${date}T${time}`;
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
    if (!startDate || !startTime || !endDate || !endTime) {
      setError('Start and end date/time required');
      return;
    }
    const startsAt = new Date(combine(startDate, startTime));
    const endsAt = new Date(combine(endDate, endTime));
    if (endsAt <= startsAt) {
      setError('End must be after start');
      return;
    }
    const capacityNum = Number(primaryTicketCapacity);
    startTransition(async () => {
      try {
        const result = await createEvent({
          name: name.trim(),
          description: description.trim() || undefined,
          venueName: venueName.trim() || undefined,
          venueAddress: venueAddress.trim() || undefined,
          venueLat,
          venueLng,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          timezone: selectedMarket?.timezone ?? 'America/Denver',
          marketId,
          visibility,
          primaryTicketName: primaryTicketName.trim() || undefined,
          primaryTicketCapacity:
            Number.isFinite(capacityNum) && capacityNum > 0 ? capacityNum : undefined,
        });
        setOpen(false);
        router.push(`/events/${result.id}`);
      } catch (err) {
        // Surface the server-side error — createEvent throws with a
        // meaningful message (UNAUTHORIZED / FORBIDDEN / validation).
        const msg = err instanceof Error ? err.message : 'Failed to create event';
        console.warn('[new-event] createEvent failed', err);
        setError(msg);
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

          {/* Split date + time avoids the chunky Chrome datetime-local
              widget that pops a clock + scrolling hour/minute/AMPM column.
              Native date + time pickers separately render as a tight
              calendar and a simple HH:MM field. */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" required>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || new Date(endDate) < new Date(e.target.value))
                      setEndDate(e.target.value);
                  }}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  step={300}
                  className="w-28 rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </Field>
            <Field label="Ends" required>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  step={300}
                  className="w-28 rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </Field>
          </div>

          <Field label="Venue (optional)">
            <VenueAutocomplete
              valueName={venueName}
              valueAddress={venueAddress}
              onChange={({ name: n, address, lat, lng }) => {
                setVenueName(n);
                setVenueAddress(address);
                setVenueLat(lat ?? null);
                setVenueLng(lng ?? null);
              }}
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
                inputMode="numeric"
                value={primaryTicketCapacity}
                onChange={(e) => setPrimaryTicketCapacity(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Capacity"
              />
            </div>
          </fieldset>

          <Field label="Visibility">
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as 'PRIVATE' | 'MARKET_WIDE' | 'HOST_ONLY')
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="PRIVATE">Private — market managers + hosts</option>
              <option value="MARKET_WIDE">Market-wide — any rep in this market can see it</option>
              <option value="HOST_ONLY">Host-only — just you and assigned hosts (+ admins)</option>
            </select>
            <p className="mt-1 text-[11px] text-gray-500">
              Host-only hides the event from coworkers who aren't assigned. Admins still see
              everything for oversight.
            </p>
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

function defaultDate(): string {
  // Tomorrow — easy to nudge forward from here. Kept in YYYY-MM-DD so
  // both <input type="date"> and the ISO combine later are clean.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
