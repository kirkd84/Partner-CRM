/**
 * /calendar — rep's unified calendar view (SPEC §6.4).
 *
 * Two scopes, toggled via ?scope query param:
 *   • "me"   (default) — the caller's own appointments, partner
 *                        events, and cached external events.
 *   • "team"            — every rep in the caller's markets.
 *                        Other reps' events show up as opaque
 *                        "Busy · {first name}" blocks. No titles,
 *                        locations, or notes leak — only the fact
 *                        that the time is blocked. The caller's OWN
 *                        rows in team view keep full detail.
 *
 * Privacy rule for team view: if the current user does not own an
 * event, its title collapses to "Busy", partner link is dropped,
 * and location/description are nulled server-side before the data
 * ever reaches the client bundle. That way even inspecting the
 * DOM can't leak Janessa's kid's play.
 */
import { auth } from '@/auth';
import { prisma } from '@partnerradar/db';
import { startOfWeek, endOfWeek } from './dateUtils';
import { CalendarShell } from './CalendarShell';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; scope?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  const sp = await searchParams;
  const view = (sp.view as 'week' | 'day' | 'list' | undefined) ?? 'week';
  const scope = (sp.scope as 'me' | 'team' | undefined) ?? 'me';
  const anchor = sp.date ? new Date(sp.date) : new Date();
  const rangeStart = view === 'day' ? dayStart(anchor) : startOfWeek(anchor);
  const rangeEnd = view === 'day' ? dayEnd(anchor) : endOfWeek(anchor);

  // Build the userId filter. "me" → just the caller. "team" → every
  // rep who shares at least one market with the caller.
  const teamUserIds = await resolveTeamUserIds(userId, session.user.markets ?? []);
  const userFilter: { in: string[] } = scope === 'team' ? { in: teamUserIds } : { in: [userId] };

  // Name + avatar color lookup for team view (used to attribute each
  // event to a rep without exposing the event content).
  const repById = new Map<string, { name: string; avatarColor: string }>();
  if (scope === 'team') {
    const reps = await prisma.user.findMany({
      where: { id: userFilter },
      select: { id: true, name: true, avatarColor: true },
    });
    for (const r of reps) repById.set(r.id, { name: r.name, avatarColor: r.avatarColor });
  }

  // ── Internal appointments ──
  const appointments = await prisma.appointment.findMany({
    where: {
      userId: userFilter,
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
    },
    orderBy: { startsAt: 'asc' },
    include: {
      partner: { select: { id: true, companyName: true, publicId: true } },
      appointmentType: { select: { id: true, name: true } },
    },
  });

  // ── Partner events (Chamber mixers etc.) ──
  type EventRow = {
    id: string;
    userId: string;
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
        userId: userFilter,
        startsAt: { lt: rangeEnd },
      },
      orderBy: { startsAt: 'asc' },
      include: { partner: { select: { id: true, companyName: true } } },
    });
  } catch {
    /* Event table pre-migration — ignore */
  }

  // ── Cached external calendar events ──
  type CachedRow = {
    id: string;
    userId: string;
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
      where: { userId: userFilter, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
      orderBy: { startsAt: 'asc' },
    });
  } catch {
    /* No cache yet */
  }

  // ── Privacy redaction ──
  // For any row NOT owned by the caller in team view: collapse title
  // to "Busy · <first name>", drop partner + location + type. This
  // is done server-side so the redacted data is the ONLY thing that
  // ever hits the wire.
  const firstNameOf = (id: string) => {
    const r = repById.get(id);
    if (!r) return 'Teammate';
    return r.name.split(/\s+/)[0] ?? r.name;
  };
  const colorOf = (id: string) => repById.get(id)?.avatarColor ?? '#9ca3af';

  const appointmentsSer = appointments.map((a) => {
    const isMine = a.userId === userId;
    return {
      id: a.id,
      ownerId: a.userId,
      ownerFirstName: scope === 'team' && !isMine ? firstNameOf(a.userId) : null,
      ownerColor: scope === 'team' && !isMine ? colorOf(a.userId) : null,
      redacted: scope === 'team' && !isMine,
      title: scope === 'team' && !isMine ? `Busy · ${firstNameOf(a.userId)}` : a.title,
      type: scope === 'team' && !isMine ? 'Busy' : (a.appointmentType?.name ?? a.type),
      location: scope === 'team' && !isMine ? null : a.location,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      allDay: a.allDay,
      partner:
        scope === 'team' && !isMine
          ? null
          : a.partner
            ? { id: a.partner.id, name: a.partner.companyName, publicId: a.partner.publicId }
            : null,
    };
  });

  const eventsSer = events.map((e) => {
    const isMine = e.userId === userId;
    return {
      id: e.id,
      ownerId: e.userId,
      ownerFirstName: scope === 'team' && !isMine ? firstNameOf(e.userId) : null,
      ownerColor: scope === 'team' && !isMine ? colorOf(e.userId) : null,
      redacted: scope === 'team' && !isMine,
      title: scope === 'team' && !isMine ? `Busy · ${firstNameOf(e.userId)}` : e.title,
      type: scope === 'team' && !isMine ? 'Busy' : e.type,
      location: scope === 'team' && !isMine ? null : e.location,
      startsAt: e.startsAt.toISOString(),
      endsAt: (e.endsAt ?? new Date(e.startsAt.getTime() + 60 * 60 * 1000)).toISOString(),
      partner:
        scope === 'team' && !isMine
          ? null
          : e.partner
            ? { id: e.partner.id, name: e.partner.companyName }
            : null,
    };
  });

  const externalsSer = externals.map((x) => {
    const isMine = x.userId === userId;
    return {
      id: x.id,
      ownerId: x.userId,
      ownerFirstName: scope === 'team' && !isMine ? firstNameOf(x.userId) : null,
      ownerColor: scope === 'team' && !isMine ? colorOf(x.userId) : null,
      redacted: scope === 'team' && !isMine,
      externalEventId: x.externalEventId,
      provider: x.provider,
      title: scope === 'team' && !isMine ? `Busy · ${firstNameOf(x.userId)}` : x.title,
      location: scope === 'team' && !isMine ? null : x.location,
      startsAt: x.startsAt.toISOString(),
      endsAt: x.endsAt.toISOString(),
    };
  });

  return (
    <CalendarShell
      view={view}
      scope={scope}
      anchorISO={anchor.toISOString()}
      appointments={appointmentsSer}
      events={eventsSer}
      externals={externalsSer}
    />
  );
}

async function resolveTeamUserIds(callerId: string, markets: string[]): Promise<string[]> {
  if (markets.length === 0) return [callerId];
  const mates = await prisma.userMarket.findMany({
    where: { marketId: { in: markets } },
    select: { userId: true },
  });
  const unique = new Set<string>([callerId]);
  for (const m of mates) unique.add(m.userId);
  return [...unique];
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
