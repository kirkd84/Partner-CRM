/**
 * Public read-only event view — SPEC_EVENTS §13 / EV-11.
 *
 * The organizer hands this URL to a venue contact, caterer, or AV
 * vendor. They see the schedule, attendee list (names only, no
 * contact info), ticket counts, sub-events, and venue details — no
 * login required. The shareToken is unguessable and can be rotated
 * or disabled from the event header.
 *
 * We deliberately omit: invitee emails, phones, RSVP tokens, partner
 * IDs, and anything that could be used to contact attendees directly
 * or impersonate them. The bar is "vendor could accidentally forward
 * this link and no PII escapes beyond a guest list."
 */

import { notFound } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { tenant } from '@partnerradar/config';

export const dynamic = 'force-dynamic';

export default async function ShareEventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await prisma.evEvent.findUnique({
    where: { shareToken: token },
    include: {
      market: { select: { name: true, timezone: true } },
      hosts: {
        include: { user: { select: { name: true } } },
      },
      ticketTypes: {
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      },
      subEvents: { orderBy: { startsAt: 'asc' } },
      invites: {
        where: { status: 'CONFIRMED' },
        include: {
          partner: { select: { companyName: true } },
          ticketAssignments: {
            include: {
              ticketType: { select: { name: true, isPrimary: true } },
            },
          },
        },
        orderBy: [{ partner: { companyName: 'asc' } }, { adHocName: 'asc' }],
      },
    },
  });
  if (!event) notFound();

  const t = tenant();

  // Count confirmed attendees by primary ticket.
  const attendees = event.invites.map((i) => ({
    name: i.partner?.companyName ?? i.adHocName ?? 'Guest',
    plusOneName: i.plusOneName,
    plusOneAllowed: i.plusOneAllowed,
    tickets: i.ticketAssignments.map((a) => ({
      name: a.ticketType.name,
      isPrimary: a.ticketType.isPrimary,
    })),
  }));

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="text-center">
          <p className="text-[11px] uppercase tracking-label text-gray-500">
            {t.brandName} · Shared event view
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-gray-900">{event.name}</h1>
          {event.canceledAt ? (
            <p className="mt-2 inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              Event canceled{event.canceledReason ? ` — ${event.canceledReason}` : ''}
            </p>
          ) : null}
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="When">{formatRange(event.startsAt, event.endsAt, event.timezone)}</Row>
            <Row label="Market">{event.market.name}</Row>
            {event.venueName ? (
              <Row label="Venue">
                {event.venueName}
                {event.venueAddress ? (
                  <div className="text-[12px] text-gray-500">{event.venueAddress}</div>
                ) : null}
              </Row>
            ) : null}
            <Row label="Status">{event.status}</Row>
          </dl>
          {event.description ? (
            <p className="mt-4 whitespace-pre-line border-t border-gray-100 pt-4 text-sm text-gray-700">
              {event.description}
            </p>
          ) : null}
        </section>

        {event.ticketTypes.length > 0 && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Tickets</h2>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {event.ticketTypes.map((tt) => {
                const confirmedForThis = event.invites.reduce(
                  (acc, inv) =>
                    acc + inv.ticketAssignments.filter((a) => a.ticketType.name === tt.name).length,
                  0,
                );
                return (
                  <li key={tt.id} className="flex items-center justify-between py-2">
                    <span className="font-medium text-gray-900">
                      {tt.name}
                      {tt.isPrimary ? (
                        <span className="ml-2 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          Primary
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular-nums text-gray-600">
                      {confirmedForThis} / {tt.capacity}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {event.subEvents.length > 0 && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Schedule</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {event.subEvents.map((sub) => (
                <li
                  key={sub.id}
                  className="flex items-start justify-between border-l-2 border-indigo-200 bg-indigo-50/40 px-3 py-2"
                >
                  <div>
                    <p className="font-medium text-gray-900">{sub.name}</p>
                    <p className="text-[11px] uppercase tracking-label text-gray-500">{sub.kind}</p>
                    {sub.venueName ? (
                      <p className="mt-0.5 text-[12px] text-gray-600">{sub.venueName}</p>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-gray-700">
                    {formatRange(sub.startsAt, sub.endsAt, event.timezone)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {event.hosts.length > 0 && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Hosts</h2>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              {event.hosts.map((h) => (
                <li
                  key={h.id}
                  className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-700"
                >
                  {h.user.name ?? 'Host'}
                </li>
              ))}
            </ul>
          </section>
        )}

        {attendees.length > 0 && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Confirmed guest list</h2>
              <span className="text-[11px] text-gray-500">{attendees.length} confirmed</span>
            </div>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {attendees.map((a, idx) => (
                <li key={idx} className="flex items-start justify-between py-2">
                  <div>
                    <p className="font-medium text-gray-900">{a.name}</p>
                    {a.plusOneName ? (
                      <p className="mt-0.5 text-[12px] text-gray-500">+1: {a.plusOneName}</p>
                    ) : a.plusOneAllowed ? (
                      <p className="mt-0.5 text-[12px] text-gray-400">(+1 allowed)</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {a.tickets.map((tt, tIdx) => (
                      <span
                        key={tIdx}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          tt.isPrimary
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {tt.name}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="pt-2 text-center text-[11px] text-gray-500">
          Shared view · read-only · {t.legalName}
        </footer>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[11px] uppercase tracking-label text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </>
  );
}

function formatRange(start: Date, end: Date, tz: string): string {
  try {
    const s = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(start);
    const e = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(end);
    return `${s} – ${e}`;
  } catch {
    return start.toLocaleString();
  }
}
