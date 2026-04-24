/**
 * GET /api/events/[id]/export?view=funnel|invites|attendance
 *
 * CSV downloads for event analytics (SPEC_EVENTS §10 + manager+ perm).
 * Body is built as plain text — no heavyweight CSV lib needed for
 * these shapes, and we get full control over newline/quoting.
 */

import { NextRequest } from 'next/server';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { computeEventAnalytics } from '@/lib/events/analytics';

function csvEscape(s: string | null | undefined): string {
  if (s == null) return '';
  const needs = /[",\n\r]/.test(s);
  const esc = s.replace(/"/g, '""');
  return needs ? `"${esc}"` : esc;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map((c) => csvEscape(c == null ? '' : String(c))).join(',');
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id: eventId } = await ctx.params;
  const view = req.nextUrl.searchParams.get('view') ?? 'invites';

  const event = await prisma.evEvent.findUnique({
    where: { id: eventId },
    include: { hosts: { select: { userId: true } } },
  });
  if (!event) return new Response('Not found', { status: 404 });

  // Manager+ or host/creator.
  const role = session.user.role;
  const markets = session.user.markets ?? [];
  const canSee =
    role === 'ADMIN' ||
    (markets.includes(event.marketId) &&
      (role === 'MANAGER' ||
        event.createdBy === session.user.id ||
        event.hosts.some((h) => h.userId === session.user.id)));
  if (!canSee) return new Response('Forbidden', { status: 403 });

  const safeName = event.name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
  const filename = `${safeName}-${view}.csv`;

  if (view === 'funnel') {
    const a = await computeEventAnalytics(eventId);
    const lines = [
      csvRow(['Step', 'Count']),
      csvRow(['Invited', a.funnel.invited]),
      csvRow(['Accepted', a.funnel.accepted]),
      csvRow(['Confirmed', a.funnel.confirmed]),
      csvRow(['Attended', a.funnel.attended]),
      csvRow(['No-show', a.funnel.noShow]),
      csvRow(['Declined', a.funnel.declined]),
      csvRow(['Expired', a.funnel.expired]),
      csvRow(['Auto-canceled', a.funnel.autoCanceled]),
      '',
      csvRow(['Ticket', 'Capacity', 'Confirmed', 'CheckedIn', 'UtilizationPct']),
      ...a.ticketUtilization.map((t) =>
        csvRow([
          t.ticketName,
          t.capacity,
          t.confirmed,
          t.checkedIn,
          (t.utilization * 100).toFixed(1),
        ]),
      ),
    ];
    return csvResponse(lines.join('\r\n'), filename);
  }

  if (view === 'attendance') {
    const invites = await prisma.evInvite.findMany({
      where: { eventId },
      include: {
        partner: { select: { companyName: true } },
        ticketAssignments: {
          include: {
            ticketType: { select: { name: true, isPrimary: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const lines = [
      csvRow([
        'Name',
        'Email',
        'Phone',
        'Status',
        'Primary Ticket',
        'Checked-In At',
        'All Tickets',
      ]),
      ...invites.map((i) => {
        const name = i.partner?.companyName ?? i.adHocName ?? '';
        const primary = i.ticketAssignments.find((a) => a.ticketType.isPrimary);
        return csvRow([
          name,
          i.adHocEmail ?? '',
          i.adHocPhone ?? '',
          i.status,
          primary?.ticketType.name ?? '',
          primary?.checkedInAt?.toISOString() ?? '',
          i.ticketAssignments.map((a) => `${a.ticketType.name}:${a.status}`).join('|'),
        ]);
      }),
    ];
    return csvResponse(lines.join('\r\n'), filename);
  }

  // Default: invites
  const invites = await prisma.evInvite.findMany({
    where: { eventId },
    include: {
      partner: { select: { companyName: true } },
      ticketAssignments: {
        include: { ticketType: { select: { name: true, isPrimary: true } } },
      },
    },
    orderBy: { queueOrder: 'asc' },
  });
  const lines = [
    csvRow([
      'Name',
      'Status',
      'QueueOrder',
      'QueueTier',
      'SentAt',
      'RespondedAt',
      'ConfirmedAt',
      'Tickets',
    ]),
    ...invites.map((i) =>
      csvRow([
        i.partner?.companyName ?? i.adHocName ?? '',
        i.status,
        i.queueOrder,
        i.queueTier,
        i.sentAt?.toISOString() ?? '',
        i.respondedAt?.toISOString() ?? '',
        i.confirmedAt?.toISOString() ?? '',
        i.ticketAssignments.map((a) => a.ticketType.name).join('|'),
      ]),
    ),
  ];
  return csvResponse(lines.join('\r\n'), filename);
}

function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
