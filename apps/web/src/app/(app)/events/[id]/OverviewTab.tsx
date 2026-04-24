'use client';

/**
 * Overview tab — read-only summary with an inline Edit button that
 * swaps the card into a form. Keeps the page calm; edit lives in one
 * spot instead of sprawling edit-in-place everywhere.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@partnerradar/ui';
import { Pencil, Save, X } from 'lucide-react';
import { updateEvent } from '../actions';

interface Market {
  id: string;
  name: string;
  timezone: string;
}

interface Event {
  id: string;
  name: string;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  visibility: 'PRIVATE' | 'MARKET_WIDE' | 'PUBLIC' | 'HOST_ONLY';
  defaultPlusOnesAllowed: boolean;
  emailSubject: string | null;
  smsBodyTemplate: string | null;
  market: Market;
  canceledAt: Date | null;
  canceledReason: string | null;
}

export function OverviewTab({
  event,
  canEdit,
}: {
  event: Event;
  canEdit: boolean;
  markets: Market[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description ?? '');
  const [venueName, setVenueName] = useState(event.venueName ?? '');
  const [venueAddress, setVenueAddress] = useState(event.venueAddress ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(event.endsAt));
  const [visibility, setVisibility] = useState<'PRIVATE' | 'MARKET_WIDE' | 'PUBLIC' | 'HOST_ONLY'>(
    event.visibility,
  );
  const [defaultPlusOnes, setDefaultPlusOnes] = useState(event.defaultPlusOnesAllowed);
  const [emailSubject, setEmailSubject] = useState(event.emailSubject ?? '');
  const [smsBody, setSmsBody] = useState(event.smsBodyTemplate ?? '');

  function reset() {
    setName(event.name);
    setDescription(event.description ?? '');
    setVenueName(event.venueName ?? '');
    setVenueAddress(event.venueAddress ?? '');
    setStartsAt(toLocalInput(event.startsAt));
    setEndsAt(toLocalInput(event.endsAt));
    setVisibility(event.visibility);
    setDefaultPlusOnes(event.defaultPlusOnesAllowed);
    setEmailSubject(event.emailSubject ?? '');
    setSmsBody(event.smsBodyTemplate ?? '');
    setError(null);
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateEvent(event.id, {
          name,
          description,
          venueName,
          venueAddress,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          visibility,
          defaultPlusOnesAllowed: defaultPlusOnes,
          emailSubject,
          smsBodyTemplate: smsBody,
        });
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <div className="space-y-5">
      {event.canceledAt && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <strong>Canceled:</strong> {event.canceledReason ?? 'No reason recorded'} ·{' '}
          {event.canceledAt.toLocaleString()}
        </div>
      )}

      <Card
        title={
          <span className="flex items-center justify-between">
            <span>Overview</span>
            {canEdit && !editing && !event.canceledAt && (
              <button
                type="button"
                onClick={() => {
                  reset();
                  setEditing(true);
                }}
                className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 transition hover:border-primary hover:text-primary"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
          </span>
        }
      >
        {!editing ? (
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <Row label="Name" value={event.name} />
            <Row label="Market" value={event.market.name} />
            <Row
              label="Starts"
              value={formatWhen(event.startsAt, event.timezone)}
              detail={event.timezone}
            />
            <Row label="Ends" value={formatWhen(event.endsAt, event.timezone)} />
            <Row
              label="Venue"
              value={event.venueName ?? '—'}
              detail={event.venueAddress ?? undefined}
            />
            <Row label="Visibility" value={event.visibility.replace(/_/g, ' ').toLowerCase()} />
            <Row
              label="Default plus-ones"
              value={event.defaultPlusOnesAllowed ? 'Enabled' : 'Disabled'}
            />
            {event.description && <Row label="Description" value={event.description} multiline />}
            {(event.emailSubject || event.smsBodyTemplate) && (
              <>
                <Row
                  label="Email subject"
                  value={event.emailSubject ?? '— auto-generated —'}
                  muted={!event.emailSubject}
                />
                <Row
                  label="SMS body"
                  value={event.smsBodyTemplate ?? '— auto-generated —'}
                  muted={!event.smsBodyTemplate}
                  multiline
                />
              </>
            )}
          </dl>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave();
            }}
            className="space-y-3"
          >
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
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
            <Field label="Venue name">
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Venue address">
              <input
                type="text"
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Visibility">
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as typeof visibility)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="MARKET_WIDE">Market-wide</option>
                  <option value="HOST_ONLY">Host and managers only</option>
                  <option value="PRIVATE">Private (managers + admins)</option>
                </select>
              </Field>
              <Field label="Default plus-ones">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={defaultPlusOnes}
                    onChange={(e) => setDefaultPlusOnes(e.target.checked)}
                    className="rounded"
                  />
                  Invitees can bring a plus-one by default
                </label>
              </Field>
            </div>
            <Field label="Email subject (optional)">
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder={`You're invited: ${name}`}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="SMS body (optional)">
              <textarea
                rows={2}
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                placeholder="Hi {{firstName}}! You're invited to {{event.name}} on {{event.date}} — RSVP: {{rsvpLink}}"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setEditing(false);
                  reset();
                }}
              >
                <X className="h-3.5 w-3.5" /> Discard
              </Button>
              <Button onClick={onSave} loading={isPending}>
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  detail,
  multiline,
  muted,
}: {
  label: string;
  value: string;
  detail?: string;
  multiline?: boolean;
  muted?: boolean;
}) {
  return (
    <>
      <dt className="pt-0.5 text-[11px] uppercase tracking-label text-gray-500">{label}</dt>
      <dd
        className={`${multiline ? 'whitespace-pre-wrap' : 'truncate'} ${muted ? 'text-gray-400' : 'text-gray-900'}`}
      >
        {value}
        {detail && <div className="text-[11px] text-gray-500">{detail}</div>}
      </dd>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
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
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
