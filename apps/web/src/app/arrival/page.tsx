/**
 * Public /arrival?token=<rsvpToken> page — no auth.
 *
 * The 4h-before "arrival details" SMS deep-links here because there
 * isn't room in 160 chars for parking info + dinner table + venue map.
 * We re-use the invitee's RSVP token so they don't need another
 * credential; the token already lets them change their RSVP.
 *
 * Shows:
 *   • Venue map (Google Static Maps, key-gated; falls back to address text)
 *   • Per-ticket QR codes (Game, Dinner, Parking) inline
 *   • Plus-one name if applicable
 *   • Host contact chips (tap-to-call)
 *   • Event description + dress code etc.
 *
 * Mobile-first. No auth chrome. Respectful of data usage — QR images
 * are 200px; map image capped at 640x300.
 */

import { notFound } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { tenant } from '@partnerradar/config';
import { signTicketToken } from '@/lib/events/qr';

export const dynamic = 'force-dynamic';

export default async function ArrivalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token;
  if (!token) notFound();

  const invite = await prisma.evInvite.findUnique({
    where: { rsvpToken: token },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          description: true,
          venueName: true,
          venueAddress: true,
          venueLat: true,
          venueLng: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          status: true,
          canceledAt: true,
        },
      },
      partner: { select: { companyName: true } },
      ticketAssignments: {
        where: { status: 'CONFIRMED' },
        include: {
          ticketType: { select: { id: true, name: true, isPrimary: true, description: true } },
        },
      },
    },
  });
  if (!invite) notFound();
  const event = invite.event;
  const t = tenant();
  const firstName = invite.partner?.companyName ?? invite.adHocName?.split(/\s+/)[0] ?? 'there';

  // Load hosts with public contact info for tap-to-call chips.
  // User model doesn't carry phone directly; we expose email only for
  // now. Phone will light up when User.phone is added in a later
  // schema pass (EV-8 check-in UI exercises the same surface).
  const hosts = await prisma.evHost.findMany({
    where: { eventId: event.id },
    include: {
      user: { select: { name: true, email: true } },
    },
    take: 6,
  });

  // Map image (Google Static Maps). Falls back to plain-text address
  // if no key is configured — we never want to leave the user
  // without venue info just because we haven't paid Google yet.
  const mapsKey = process.env.GOOGLE_MAPS_STATIC_KEY || process.env.GOOGLE_MAPS_API_KEY;
  const mapUrl =
    mapsKey && (event.venueLat || event.venueAddress)
      ? (() => {
          const marker =
            event.venueLat != null && event.venueLng != null
              ? `${event.venueLat},${event.venueLng}`
              : event.venueAddress!;
          const center = marker;
          return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(center)}&zoom=15&size=640x300&scale=2&markers=color:red%7C${encodeURIComponent(marker)}&key=${mapsKey}`;
        })()
      : null;
  const directionsUrl = event.venueAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venueAddress)}`
    : null;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-lg space-y-4">
        <header className="text-center">
          <p className="text-[11px] uppercase tracking-label text-gray-500">{t.brandName}</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Arrival details</h1>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">{event.name}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {formatWhen(event.startsAt, event.timezone)} –{' '}
            {formatTime(event.endsAt, event.timezone)}
          </p>
          {event.venueName ? <p className="mt-1 text-sm text-gray-600">{event.venueName}</p> : null}
          {event.venueAddress ? (
            <p className="mt-0.5 text-sm text-gray-500">{event.venueAddress}</p>
          ) : null}
          {directionsUrl ? (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900"
            >
              Get directions →
            </a>
          ) : null}
        </section>

        {mapUrl ? (
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mapUrl}
              alt={`Map of ${event.venueName ?? event.venueAddress ?? event.name}`}
              className="h-48 w-full object-cover"
              loading="lazy"
            />
          </section>
        ) : null}

        {invite.ticketAssignments.length > 0 && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Your tickets</h3>
            <p className="mt-1 text-[12px] text-gray-500">
              Show these at check-in — QR scans faster than your name.
            </p>
            <ul className="mt-3 divide-y divide-gray-100">
              {invite.ticketAssignments.map((a) => {
                const sig = signTicketToken({
                  eventId: event.id,
                  assignmentId: a.id,
                  inviteId: invite.id,
                  ticketTypeId: a.ticketType.id,
                });
                const qrUrl = `/api/events/${event.id}/qr/${a.id}?token=${encodeURIComponent(sig)}`;
                return (
                  <li key={a.id} className="flex items-center gap-4 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrUrl}
                      alt={`${a.ticketType.name} QR code`}
                      width={120}
                      height={120}
                      className="h-[120px] w-[120px] rounded border border-gray-100 bg-white"
                    />
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-gray-900">{a.ticketType.name}</p>
                      {a.ticketType.description ? (
                        <p className="mt-0.5 text-xs text-gray-600">{a.ticketType.description}</p>
                      ) : null}
                      {invite.plusOneAllowed && invite.plusOneName && a.ticketType.isPrimary ? (
                        <p className="mt-0.5 text-xs text-gray-500">+1: {invite.plusOneName}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {event.description ? (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">About</h3>
            <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{event.description}</p>
          </section>
        ) : null}

        {hosts.length > 0 ? (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Your hosts</h3>
            <ul className="mt-2 space-y-2">
              {hosts.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-gray-900">{h.user.name ?? 'Host'}</span>
                  <span className="flex items-center gap-2 text-xs">
                    {h.user.email ? (
                      <a
                        href={`mailto:${h.user.email}`}
                        className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-700"
                      >
                        Email
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="pt-2 text-center text-[11px] text-gray-500">
          {t.legalName} · {t.physicalAddress}
        </footer>
      </div>
    </div>
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
function formatTime(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
