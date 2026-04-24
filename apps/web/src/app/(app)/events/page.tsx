/**
 * /events — top-level event tracking hub.
 *
 * Two tabs: Upcoming (startsAt >= now, status != CANCELED) and Past
 * (everything else). Tab state lives in the URL (?tab=upcoming|past)
 * so both views are bookmarkable.
 *
 * Visibility rules per SPEC_EVENTS.md §12:
 *   • Admins see everything.
 *   • Managers see everything in their markets.
 *   • Reps see only events where they're a host OR that they created.
 */

import Link from 'next/link';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { Pill } from '@partnerradar/ui';
import { Calendar, MapPin, Ticket, Users, Clock } from 'lucide-react';
import { NewEventButton } from './NewEventButton';

export const dynamic = 'force-dynamic';

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const sp = await searchParams;
  const tab = sp.tab === 'past' ? 'past' : 'upcoming';

  const userId = session.user.id;
  const role = session.user.role;
  const markets = session.user.markets ?? [];

  // Scope: admin sees all; manager sees their markets; rep sees events
  // they host or created (still restricted to their markets).
  const marketScope =
    role === 'ADMIN' ? {} : { marketId: { in: markets.length > 0 ? markets : ['__none__'] } };
  const repScope =
    role === 'REP'
      ? {
          OR: [{ createdBy: userId }, { hosts: { some: { userId } } }],
        }
      : {};

  const now = new Date();

  const [upcoming, past, marketsList] = await Promise.all([
    prisma.evEvent
      .findMany({
        where: {
          ...marketScope,
          ...repScope,
          status: { not: 'CANCELED' },
          startsAt: { gte: now },
        },
        orderBy: { startsAt: 'asc' },
        include: {
          market: { select: { id: true, name: true } },
          ticketTypes: { select: { id: true, name: true, capacity: true, isPrimary: true } },
          hosts: { select: { userId: true } },
          _count: { select: { invites: true } },
        },
      })
      .catch(() => []),
    prisma.evEvent
      .findMany({
        where: {
          ...marketScope,
          ...repScope,
          OR: [{ status: 'CANCELED' }, { startsAt: { lt: now } }],
        },
        orderBy: { startsAt: 'desc' },
        take: 50,
        include: {
          market: { select: { id: true, name: true } },
          ticketTypes: { select: { id: true, name: true, capacity: true, isPrimary: true } },
          _count: { select: { invites: true } },
        },
      })
      .catch(() => []),
    prisma.market.findMany({
      where: role === 'ADMIN' ? {} : { id: { in: markets } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, timezone: true },
    }),
  ]);

  const rows = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Events</h1>
          <p className="text-xs text-gray-500">
            Game suites, trade shows, dinners — with invite queues and RSVP tracking.
          </p>
        </div>
        <div className="ml-auto">
          <NewEventButton markets={marketsList} />
        </div>
      </header>

      <div className="flex items-center gap-1 border-b border-card-border bg-white px-6">
        <TabLink
          label={`Upcoming · ${upcoming.length}`}
          href="/events?tab=upcoming"
          active={tab === 'upcoming'}
        />
        <TabLink label={`Past · ${past.length}`} href="/events?tab=past" active={tab === 'past'} />
      </div>

      <div className="flex-1 overflow-auto bg-canvas p-6">
        {rows.length === 0 ? (
          <div className="mx-auto max-w-lg rounded-lg border border-card-border bg-white p-10 text-center">
            <Calendar className="mx-auto h-8 w-8 text-gray-300" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">
              {tab === 'upcoming' ? 'No upcoming events' : 'No past events yet'}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              {tab === 'upcoming'
                ? 'Create your first event — suite night, open house, trade show, coffee hour.'
                : 'Once events wrap, their attendance + ROI summaries show up here.'}
            </p>
            {tab === 'upcoming' && (
              <div className="mt-4 flex justify-center">
                <NewEventButton markets={marketsList} />
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((ev) => {
              const primary = ev.ticketTypes.find((t) => t.isPrimary);
              return (
                <Link
                  key={ev.id}
                  href={`/events/${ev.id}`}
                  className="block rounded-lg border border-card-border bg-white p-4 transition hover:border-primary hover:shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <Pill color={statusColor(ev.status)} tone="soft">
                      {ev.status}
                    </Pill>
                    <span className="font-mono text-[11px] text-gray-400">{ev.publicId}</span>
                    <span className="ml-auto text-[11px] text-gray-500">{ev.market.name}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">{ev.name}</h3>
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-600">
                    <Clock className="mt-[1px] h-3 w-3 shrink-0 text-gray-400" />
                    <span>{formatWhen(ev.startsAt, ev.timezone)}</span>
                  </div>
                  {ev.venueName && (
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-gray-600">
                      <MapPin className="mt-[1px] h-3 w-3 shrink-0 text-gray-400" />
                      <span className="truncate">{ev.venueName}</span>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    {primary && (
                      <span className="inline-flex items-center gap-1">
                        <Ticket className="h-3 w-3" /> {primary.capacity} {primary.name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {ev._count.invites} invites
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TabLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
      }`}
    >
      {label}
    </Link>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case 'DRAFT':
      return '#6b7280';
    case 'SCHEDULED':
      return '#0ea5e9';
    case 'LIVE':
      return '#10b981';
    case 'COMPLETED':
      return '#6366f1';
    case 'CANCELED':
      return '#ef4444';
    default:
      return '#9ca3af';
  }
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
