'use client';

/**
 * RSVP client island. Renders appropriate UI based on invite status:
 *   • SENT / QUEUED → initial-accept UI
 *   • ACCEPTED / CONFIRMATION_REQUESTED → "quick confirm" UI
 *   • CONFIRMED → confirmation page with add-to-calendar
 *   • DECLINED / CANCELED / etc. → terminal state message
 */

import { useState, useTransition } from 'react';
import { CheckCircle2, XCircle, Calendar, MapPin, Clock } from 'lucide-react';
import { submitRsvp } from './actions';

interface TicketType {
  id: string;
  name: string;
  isPrimary: boolean;
  description: string | null;
}

interface TicketAssignment {
  id: string;
  status: string;
  quantity: number;
  ticketType: TicketType;
}

interface Invite {
  id: string;
  status: string;
  plusOneAllowed: boolean;
  plusOneName: string | null;
  expiresAt: string | null;
  recipientLabel: string;
  firstName: string;
  ticketAssignments: TicketAssignment[];
}

interface EventInfo {
  id: string;
  name: string;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  canceledAt: string | null;
  canceledReason: string | null;
}

interface TenantInfo {
  brandName: string;
  legalName: string;
  physicalAddress: string;
}

export function RsvpClient({
  token,
  invite: initial,
  event,
  tenant,
}: {
  token: string;
  invite: Invite;
  event: EventInfo;
  tenant: TenantInfo;
}) {
  const [invite, setInvite] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPartial, setShowPartial] = useState(false);
  const [plusOneName, setPlusOneName] = useState(invite.plusOneName ?? '');
  const [keepIds, setKeepIds] = useState<Set<string>>(
    new Set(invite.ticketAssignments.map((a) => a.ticketType.id)),
  );

  if (event.canceledAt) {
    return (
      <Card>
        <Header title={event.name} />
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
          <strong>This event was canceled.</strong>{' '}
          {event.canceledReason ?? 'The organizer will reach out separately.'}
        </div>
        <Footer tenant={tenant} />
      </Card>
    );
  }

  async function onAction(action: 'accept' | 'decline' | 'confirm' | 'cancel') {
    setError(null);
    startTransition(async () => {
      try {
        const r = await submitRsvp({
          token,
          action,
          plusOneName: plusOneName.trim() || undefined,
          keepTicketTypeIds: action === 'accept' && showPartial ? [...keepIds] : undefined,
        });
        if (!r.ok) {
          setError(r.error ?? 'Failed');
          return;
        }
        setInvite({ ...invite, status: r.status ?? invite.status });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  const isTerminalDeclined =
    invite.status === 'DECLINED' ||
    invite.status === 'CANCELED' ||
    invite.status === 'AUTO_CANCELED' ||
    invite.status === 'EXPIRED' ||
    invite.status === 'NO_SHOW';

  const isConfirmed = invite.status === 'CONFIRMED';
  const needsConfirm = invite.status === 'ACCEPTED' || invite.status === 'CONFIRMATION_REQUESTED';
  const canInitiallyAccept =
    invite.status === 'SENT' || invite.status === 'QUEUED' || invite.status === 'EXPIRED';

  return (
    <Card>
      <Header title={event.name} subtitle={`Hi ${invite.firstName} 👋`} />

      <EventDetails event={event} />

      {invite.ticketAssignments.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
            Your tickets
          </div>
          <ul className="mt-2 space-y-1">
            {invite.ticketAssignments.map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    keepIds.has(a.ticketType.id) ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                />
                <span className="flex-1">
                  <strong>{a.ticketType.name}</strong>
                  {a.ticketType.description && (
                    <span className="text-xs text-gray-500"> — {a.ticketType.description}</span>
                  )}
                  {showPartial && (
                    <label className="ml-2 inline-flex items-center gap-1 text-[11px] text-gray-600">
                      <input
                        type="checkbox"
                        checked={keepIds.has(a.ticketType.id)}
                        onChange={(e) => {
                          setKeepIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(a.ticketType.id);
                            else next.delete(a.ticketType.id);
                            return next;
                          });
                        }}
                        className="rounded"
                      />
                      Keep
                    </label>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {invite.plusOneAllowed && (canInitiallyAccept || needsConfirm) && (
        <div className="mt-4">
          <label className="block text-[11px] font-semibold uppercase tracking-label text-gray-500">
            Bringing a plus-one?
          </label>
          <input
            type="text"
            value={plusOneName}
            onChange={(e) => setPlusOneName(e.target.value)}
            placeholder="Plus-one's name (leave blank if flying solo)"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="mt-5 space-y-2">
        {canInitiallyAccept && !isConfirmed && (
          <>
            <button
              type="button"
              onClick={() => onAction('accept')}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {showPartial ? 'Accept selected tickets' : 'Count me in'}
            </button>
            <button
              type="button"
              onClick={() => onAction('decline')}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-red-300 hover:text-red-700 disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" /> Can't make it
            </button>
            {invite.ticketAssignments.length > 1 && (
              <button
                type="button"
                onClick={() => setShowPartial((v) => !v)}
                className="w-full text-center text-[11px] text-gray-500 underline"
              >
                {showPartial
                  ? 'Just accept everything'
                  : "Accept with changes — I can't make every part"}
              </button>
            )}
          </>
        )}

        {needsConfirm && (
          <>
            <button
              type="button"
              onClick={() => onAction('confirm')}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" /> Yes, still coming
            </button>
            <button
              type="button"
              onClick={() => onAction('cancel')}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-red-300 hover:text-red-700 disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" /> Need to cancel
            </button>
          </>
        )}

        {isConfirmed && <ConfirmedBlock event={event} inviteId={invite.id} token={token} />}

        {isTerminalDeclined && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-700">
            Thanks for letting us know. No further action needed.
          </div>
        )}
      </div>

      <Footer tenant={tenant} />
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      {children}
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
    </div>
  );
}

function EventDetails({ event }: { event: EventInfo }) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const localTz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : event.timezone;
  return (
    <div className="mt-3 space-y-2 text-sm text-gray-700">
      <div className="flex items-start gap-2">
        <Clock className="mt-[3px] h-3.5 w-3.5 shrink-0 text-gray-400" />
        <div>
          <div className="font-medium">{formatWhen(start, localTz)}</div>
          <div className="text-[11px] text-gray-500">
            Ends {formatTime(end, localTz)}
            {localTz !== event.timezone && (
              <span>
                {' '}
                · event time {formatWhen(start, event.timezone)} ({event.timezone})
              </span>
            )}
          </div>
        </div>
      </div>
      {event.venueName && (
        <div className="flex items-start gap-2">
          <MapPin className="mt-[3px] h-3.5 w-3.5 shrink-0 text-gray-400" />
          <div>
            <div className="font-medium">{event.venueName}</div>
            {event.venueAddress && (
              <div className="text-[11px] text-gray-500">{event.venueAddress}</div>
            )}
          </div>
        </div>
      )}
      {event.description && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{event.description}</p>
      )}
    </div>
  );
}

function ConfirmedBlock({
  event,
  inviteId,
  token,
}: {
  event: EventInfo;
  inviteId: string;
  token: string;
}) {
  const googleUrl = new URL('https://calendar.google.com/calendar/render');
  googleUrl.searchParams.set('action', 'TEMPLATE');
  googleUrl.searchParams.set('text', event.name);
  googleUrl.searchParams.set('dates', `${toIcsStamp(event.startsAt)}/${toIcsStamp(event.endsAt)}`);
  if (event.description) googleUrl.searchParams.set('details', event.description);
  const loc = [event.venueName, event.venueAddress].filter(Boolean).join(', ');
  if (loc) googleUrl.searchParams.set('location', loc);
  const icsUrl = `/api/events/${event.id}/ics?token=${encodeURIComponent(token)}`;
  void inviteId;

  return (
    <div>
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" />
        <p className="mt-1 text-sm font-semibold text-emerald-900">
          You're confirmed — see you there!
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={googleUrl.toString()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:border-primary hover:text-primary"
        >
          <Calendar className="h-3 w-3" /> Google Calendar
        </a>
        <a
          href={icsUrl}
          className="flex items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:border-primary hover:text-primary"
        >
          <Calendar className="h-3 w-3" /> Apple / Outlook (.ics)
        </a>
      </div>
    </div>
  );
}

function Footer({ tenant }: { tenant: TenantInfo }) {
  return (
    <p className="mt-6 text-center text-[10px] text-gray-400">
      {tenant.legalName} · {tenant.physicalAddress}
    </p>
  );
}

function formatWhen(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
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
function toIcsStamp(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate(),
  ).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}${String(
    d.getUTCMinutes(),
  ).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
}
