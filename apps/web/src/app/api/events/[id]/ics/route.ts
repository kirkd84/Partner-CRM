/**
 * /api/events/[id]/ics?token=... — ICS calendar export.
 *
 * Token-authenticated (rsvpToken from the invite). We build a RFC 5545
 * VCALENDAR by hand to avoid pulling in the `ics` npm dep for now —
 * straightforward enough for one event + any sub-events.
 *
 * Future: once we ship Phase EV-2's sub-event calendar sync, this
 * endpoint can also emit the sub-events as VEVENT blocks that match
 * what the invitee is entitled to see.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@partnerradar/db';
import { tenant } from '@partnerradar/config';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  if (!token) return new NextResponse('missing token', { status: 400 });

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
        },
      },
    },
  });
  if (!invite || invite.event.id !== eventId) {
    return new NextResponse('not found', { status: 404 });
  }

  const t = tenant();
  const baseUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    'https://partner-crm-production.up.railway.app';
  const rsvpUrl = `${baseUrl}/rsvp/${token}`;

  const ics = buildIcs({
    uid: `ev-${invite.event.id}@partner-portal`,
    name: invite.event.name,
    description: [invite.event.description ?? '', `RSVP: ${rsvpUrl}`]
      .filter(Boolean)
      .join('\\n\\n'),
    location: [invite.event.venueName, invite.event.venueAddress].filter(Boolean).join(', '),
    startsAt: invite.event.startsAt,
    endsAt: invite.event.endsAt,
    geoLat: invite.event.venueLat,
    geoLng: invite.event.venueLng,
    tz: invite.event.timezone,
    organizerEmail: t.replyToAddress,
    organizerName: t.brandName,
    url: rsvpUrl,
  });

  const filename = sanitizeFilename(`${invite.event.name}.ics`);
  return new NextResponse(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

function buildIcs(args: {
  uid: string;
  name: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  geoLat: number | null;
  geoLng: number | null;
  tz: string;
  organizerEmail: string;
  organizerName: string;
  url: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Partner Portal//EV//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${args.uid}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(args.startsAt)}`,
    `DTEND:${toUtcStamp(args.endsAt)}`,
    `SUMMARY:${escapeIcs(args.name)}`,
    args.location ? `LOCATION:${escapeIcs(args.location)}` : null,
    args.description ? `DESCRIPTION:${escapeIcs(args.description)}` : null,
    args.geoLat !== null && args.geoLng !== null
      ? `GEO:${args.geoLat.toFixed(6)};${args.geoLng.toFixed(6)}`
      : null,
    `ORGANIZER;CN=${escapeIcs(args.organizerName)}:mailto:${args.organizerEmail}`,
    `URL:${args.url}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT4H',
    `DESCRIPTION:${escapeIcs(`${args.name} in 4 hours`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-P1D',
    `DESCRIPTION:${escapeIcs(`${args.name} tomorrow`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.filter((l): l is string => l !== null).join('\r\n') + '\r\n';
}

function toUtcStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-z0-9._-]/gi, '_');
}
