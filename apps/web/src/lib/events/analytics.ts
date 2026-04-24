/**
 * Event analytics helpers (SPEC_EVENTS §10).
 *
 * Everything in here runs as plain SQL/Prisma queries — no cached
 * materialized views yet. Volumes at our scale (max a few hundred
 * invites per event) are fine for on-demand aggregation.
 *
 * Funnel counts + response-time distribution + message performance
 * + cost estimation live side-by-side so a page render can pull one
 * bundle and fan the numbers into cards.
 */

import { prisma } from '@partnerradar/db';

export interface EventFunnel {
  invited: number;
  accepted: number;
  confirmed: number;
  attended: number;
  noShow: number;
  declined: number;
  expired: number;
  autoCanceled: number;
}

export interface ResponseBucket {
  label: string;
  count: number;
}

export interface MessagePerformance {
  kind: string;
  scheduled: number;
  sent: number;
  canceled: number;
  failed: number;
}

export interface EventCostBreakdown {
  estSmsCost: number; // dollars
  estEmailCost: number; // dollars
  estStaffTime: number; // hours
}

export interface EventAnalytics {
  funnel: EventFunnel;
  responseBuckets: ResponseBucket[];
  messagePerformance: MessagePerformance[];
  cost: EventCostBreakdown;
  ticketUtilization: Array<{
    ticketTypeId: string;
    ticketName: string;
    capacity: number;
    confirmed: number;
    checkedIn: number;
    utilization: number; // 0..1
  }>;
}

export async function computeEventAnalytics(eventId: string): Promise<EventAnalytics> {
  const [invites, reminders, tickets, assignments] = await Promise.all([
    prisma.evInvite.findMany({
      where: { eventId },
      select: {
        id: true,
        status: true,
        sentAt: true,
        respondedAt: true,
        ticketAssignments: {
          select: {
            checkedInAt: true,
            status: true,
            ticketType: { select: { isPrimary: true } },
          },
        },
      },
    }),
    prisma.evReminder.groupBy({
      by: ['kind', 'deliveryStatus'],
      where: { eventId },
      _count: { _all: true },
    }),
    prisma.evTicketType.findMany({
      where: { eventId },
      select: { id: true, name: true, capacity: true, isPrimary: true },
    }),
    prisma.evTicketAssignment.findMany({
      where: { ticketType: { eventId } },
      select: {
        ticketTypeId: true,
        status: true,
        checkedInAt: true,
        quantity: true,
      },
    }),
  ]);

  const funnel = buildFunnel(invites);
  const responseBuckets = buildResponseBuckets(invites);
  const messagePerformance = buildMessagePerformance(reminders);
  const cost = estimateCost(invites.length, reminders);

  const ticketUtilization = tickets.map((tt) => {
    const rows = assignments.filter((a) => a.ticketTypeId === tt.id);
    const confirmed = rows
      .filter((r) => r.status === 'CONFIRMED' || r.status === 'TENTATIVE')
      .reduce((acc, r) => acc + r.quantity, 0);
    const checkedIn = rows.filter((r) => !!r.checkedInAt).reduce((acc, r) => acc + r.quantity, 0);
    return {
      ticketTypeId: tt.id,
      ticketName: tt.name,
      capacity: tt.capacity,
      confirmed,
      checkedIn,
      utilization: tt.capacity > 0 ? confirmed / tt.capacity : 0,
    };
  });

  return {
    funnel,
    responseBuckets,
    messagePerformance,
    cost,
    ticketUtilization,
  };
}

function buildFunnel(
  invites: Array<{
    status: string;
    ticketAssignments: Array<{
      checkedInAt: Date | null;
      ticketType: { isPrimary: boolean };
    }>;
  }>,
): EventFunnel {
  const terminal = new Set(['DECLINED', 'EXPIRED', 'CANCELED', 'AUTO_CANCELED']);
  let invited = 0;
  let accepted = 0;
  let confirmed = 0;
  let attended = 0;
  let noShow = 0;
  let declined = 0;
  let expired = 0;
  let autoCanceled = 0;

  for (const i of invites) {
    const everInvited =
      i.status === 'SENT' ||
      i.status === 'ACCEPTED' ||
      i.status === 'CONFIRMATION_REQUESTED' ||
      i.status === 'CONFIRMED' ||
      i.status === 'NO_SHOW' ||
      terminal.has(i.status);
    if (everInvited) invited++;
    if (
      i.status === 'ACCEPTED' ||
      i.status === 'CONFIRMATION_REQUESTED' ||
      i.status === 'CONFIRMED' ||
      i.status === 'NO_SHOW'
    ) {
      accepted++;
    }
    if (i.status === 'CONFIRMED' || i.status === 'NO_SHOW') {
      confirmed++;
    }
    const primary = i.ticketAssignments.find((a) => a.ticketType.isPrimary);
    if (primary?.checkedInAt) attended++;
    if (i.status === 'NO_SHOW') noShow++;
    if (i.status === 'DECLINED') declined++;
    if (i.status === 'EXPIRED') expired++;
    if (i.status === 'AUTO_CANCELED') autoCanceled++;
  }
  return { invited, accepted, confirmed, attended, noShow, declined, expired, autoCanceled };
}

function buildResponseBuckets(
  invites: Array<{ sentAt: Date | null; respondedAt: Date | null }>,
): ResponseBucket[] {
  const buckets: Array<{ label: string; maxHours: number; count: number }> = [
    { label: '<1h', maxHours: 1, count: 0 },
    { label: '1-6h', maxHours: 6, count: 0 },
    { label: '6-24h', maxHours: 24, count: 0 },
    { label: '1-3d', maxHours: 72, count: 0 },
    { label: '>3d', maxHours: Infinity, count: 0 },
  ];
  for (const inv of invites) {
    if (!inv.sentAt || !inv.respondedAt) continue;
    const hours = (inv.respondedAt.getTime() - inv.sentAt.getTime()) / (3600 * 1000);
    if (hours < 0) continue;
    const bucket = buckets.find((b) => hours <= b.maxHours);
    if (bucket) bucket.count++;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

function buildMessagePerformance(
  rows: Array<{ kind: string; deliveryStatus: string; _count: { _all: number } }>,
): MessagePerformance[] {
  const byKind = new Map<string, MessagePerformance>();
  for (const r of rows) {
    const existing = byKind.get(r.kind) ?? {
      kind: r.kind,
      scheduled: 0,
      sent: 0,
      canceled: 0,
      failed: 0,
    };
    const n = r._count._all;
    if (r.deliveryStatus === 'sent') existing.sent += n;
    else if (r.deliveryStatus === 'canceled') existing.canceled += n;
    else if (r.deliveryStatus === 'failed') existing.failed += n;
    existing.scheduled += n;
    byKind.set(r.kind, existing);
  }
  return [...byKind.values()].sort((a, b) => b.scheduled - a.scheduled);
}

/**
 * Rough cost estimate — not billing-grade. Assumes:
 *   • Twilio SMS ≈ $0.008/segment (US) — we bill 1 segment per reminder
 *   • Resend email ≈ $0.001/email at Pro tier
 *   • Staff prep + host time ≈ 4h + 2h per host (hosts not modeled yet;
 *     we hardwire 4h until EV-10 surfaces actual host hours)
 */
function estimateCost(
  inviteCount: number,
  reminders: Array<{ kind: string; deliveryStatus: string; _count: { _all: number } }>,
): EventCostBreakdown {
  let sent = 0;
  for (const r of reminders) {
    if (r.deliveryStatus === 'sent') sent += r._count._all;
  }
  const estSmsCost = sent * 0.008; // assume every reminder also fires SMS
  const estEmailCost = (sent + inviteCount) * 0.001;
  const estStaffTime = 4; // flat for now
  return {
    estSmsCost: round2(estSmsCost),
    estEmailCost: round2(estEmailCost),
    estStaffTime,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Partner event history — everything this partner has been invited
 * to, with per-invite status + tickets.
 */
export async function partnerEventHistory(partnerId: string) {
  const invites = await prisma.evInvite.findMany({
    where: { partnerId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          status: true,
        },
      },
      ticketAssignments: {
        include: { ticketType: { select: { name: true, isPrimary: true } } },
      },
    },
    orderBy: { event: { startsAt: 'desc' } },
    take: 100,
  });
  return invites.map((i) => ({
    eventId: i.event.id,
    eventName: i.event.name,
    eventStart: i.event.startsAt.toISOString(),
    eventEnd: i.event.endsAt.toISOString(),
    timezone: i.event.timezone,
    status: i.status,
    sentAt: i.sentAt?.toISOString() ?? null,
    respondedAt: i.respondedAt?.toISOString() ?? null,
    confirmedAt: i.confirmedAt?.toISOString() ?? null,
    tickets: i.ticketAssignments.map((a) => ({
      name: a.ticketType.name,
      isPrimary: a.ticketType.isPrimary,
      status: a.status,
      checkedIn: !!a.checkedInAt,
    })),
  }));
}
