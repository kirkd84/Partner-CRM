/**
 * /calendar — rep's unified calendar view (SPEC §6.4).
 *
 * Shows everything on the current user's plate:
 *   • Internal Appointments (created inside Partner Portal)
 *   • Partner Events (Chamber mixers, broker opens, etc.)
 *   • Cached external events from Google / Microsoft / Apple / Storm
 *     (read-only, striped background so they're visually distinct)
 *
 * View switcher: Week / Day / List.
 *   • Month view is intentionally NOT the default — reps plan in
 *     week/day chunks. We'll add it in a later pass if feedback
 *     warrants it.
 *
 * External sync workers haven't landed yet — calendarEventCache is
 * read defensively so the page works even when the cache is empty.
 */
import { auth } from '@/auth';
import { prisma } from '@partnerradar/db';
import { startOfWeek, endOfWeek } from './dateUtils';
import { CalendarShell } from './CalendarShell';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  const sp = await searchParams;
  const view = (sp.view as 'week' | 'day' | 'list' | undefined) ?? 'week';
  const anchor = sp.date ? new Date(sp.date) : new Date();
  const rangeStart = view === 'day' ? dayStart(anchor) : startOfWeek(anchor);
  const rangeEnd = view === 'day' ? dayEnd(anchor) : endOfWeek(anchor);

  // Internal appointments belonging to the current user in the window.
  const appointments = await prisma.appointment.findMany({
    where: {
      userId,
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
    },
    orderBy: { startsAt: 'asc' },
    include: {
      partner: { select: { id: true, companyName: true, publicId: true } },
      appointmentType: { select: { id: true, name: true } },
    },
  });

  // Partner events — only the user's. (Events aren't assigned to a user
  // in the same way; we fetch all events where the creating user is the
  // current user.)
  type EventRow = {
    id: string;
    title: string;
    type: string;
    location: string | null;
    startsAt: Date;
    endsAt: Date | null;
    partner: { id: string; companyName: string } | null;
  };
  let events: EventRow[] = [];
  try {
    events = await prisma.event.findMany({
      where: {
        userId,
        startsAt: { lt: rangeEnd },
      },
      orderBy: { startsAt: 'asc' },
      include: { partner: { select: { id: true, companyName: true } } },
    });
  } catch {
    /* Event table pre-migration — ignore */
  }

  // External cached events.
  type CachedRow = {
    id: string;
    externalEventId: string;
    provider: string;
    title: string;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
  };
  let externals: CachedRow[] = [];
  try {
    externals = await prisma.calendarEventCache.findMany({
      where: { userId, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
      orderBy: { startsAt: 'asc' },
    });
  } catch {
    /* No cache yet */
  }

  return (
    <CalendarShell
      view={view}
      anchorISO={anchor.toISOString()}
      appointments={appointments.map((a) => ({
        id: a.id,
        title: a.title,
        type: a.appointmentType?.name ?? a.type,
        location: a.location,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt.toISOString(),
        allDay: a.allDay,
        partner: a.partner
          ? { id: a.partner.id, name: a.partner.companyName, publicId: a.partner.publicId }
          : null,
      }))}
      events={events.map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        location: e.location,
        startsAt: e.startsAt.toISOString(),
        endsAt: (e.endsAt ?? new Date(e.startsAt.getTime() + 60 * 60 * 1000)).toISOString(),
        partner: e.partner ? { id: e.partner.id, name: e.partner.companyName } : null,
      }))}
      externals={externals.map((x) => ({
        id: x.id,
        externalEventId: x.externalEventId,
        provider: x.provider,
        title: x.title,
        location: x.location,
        startsAt: x.startsAt.toISOString(),
        endsAt: x.endsAt.toISOString(),
      }))}
    />
  );
}

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayEnd(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
