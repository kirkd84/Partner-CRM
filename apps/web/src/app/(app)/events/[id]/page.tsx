/**
 * /events/[id] — event detail with tabs.
 *
 * Tabs: Overview / Invites / Sub-events / Hosts / Dashboard / Activity.
 * Tab state lives in ?tab so every view is bookmarkable.
 *
 * All tab bodies are rendered server-side inside this file — keeps the
 * component count low and the network round-trips minimal. Each tab
 * has its own client island where mutation happens (ticket editor,
 * host picker, sub-event drawer, etc.).
 */

import Link from 'next/link';
import { auth } from '@/auth';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { Pill } from '@partnerradar/ui';
import { MapPin, Users, Ticket, ArrowLeft, Clock } from 'lucide-react';
import { EventHeaderActions } from './EventHeaderActions';
import { OverviewTab } from './OverviewTab';
import { TicketTypesCard } from './TicketTypesCard';
import { HostsTab } from './HostsTab';
import { SubEventsTab } from './SubEventsTab';
import { InvitesTab } from './InvitesTab';
import { ActivityTab } from './ActivityTab';
import { BatchOffersCard } from './BatchOffersCard';

export const dynamic = 'force-dynamic';

type TabId = 'overview' | 'invites' | 'subevents' | 'hosts' | 'dashboard' | 'activity';
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'invites', label: 'Invites' },
  { id: 'subevents', label: 'Sub-events' },
  { id: 'hosts', label: 'Hosts' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'activity', label: 'Activity' },
];

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;
  const tab: TabId = (TABS.map((t) => t.id) as string[]).includes(sp.tab ?? '')
    ? (sp.tab as TabId)
    : 'overview';

  const event = await prisma.evEvent.findUnique({
    where: { id },
    include: {
      market: { select: { id: true, name: true, timezone: true } },
      ticketTypes: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
      hosts: {
        include: { user: { select: { id: true, name: true, avatarColor: true, role: true } } },
      },
      subEvents: { orderBy: { startsAt: 'asc' } },
      _count: {
        select: { invites: true, hosts: true, subEvents: true },
      },
    },
  });
  if (!event) notFound();

  const markets = session.user.markets ?? [];
  const role = session.user.role;
  if (role !== 'ADMIN' && !markets.includes(event.marketId)) redirect('/events');
  if (role === 'REP') {
    const isCreator = event.createdBy === session.user.id;
    const isHost = event.hosts.some((h) => h.userId === session.user.id);
    if (!isCreator && !isHost) redirect('/events');
  }

  const canEdit =
    role === 'ADMIN' ||
    role === 'MANAGER' ||
    event.createdBy === session.user.id ||
    event.hosts.some((h) => h.userId === session.user.id);

  // Usable-capacity snapshot for the header pill.
  const primary = event.ticketTypes.find((t) => t.isPrimary);
  const takenByStatus = await prisma.evTicketAssignment
    .groupBy({
      by: ['status'],
      where: { ticketTypeId: primary?.id ?? '__none__' },
      _sum: { quantity: true },
    })
    .catch(() => []);
  const taken = takenByStatus
    .filter((s) => s.status === 'TENTATIVE' || s.status === 'CONFIRMED')
    .reduce((a, b) => a + (b._sum.quantity ?? 0), 0);
  const availableCount = primary ? Math.max(0, primary.capacity - taken) : 0;

  // Reps available in market (for hosts tab).
  const reps = await prisma.user.findMany({
    where: { active: true, markets: { some: { marketId: event.marketId } } },
    select: { id: true, name: true, email: true, avatarColor: true, role: true },
    orderBy: { name: 'asc' },
  });

  // Batch-offer history for the Overview card. Keep it to recent 25 so
  // the row count stays sane on events with heavy cascade activity.
  const batchOffers = await prisma.evBatchOffer
    .findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        ticketType: { select: { name: true } },
        _count: { select: { recipients: true } },
      },
    })
    .catch(() => []);
  const batchOfferClaimerInviteIds = [
    ...new Set(batchOffers.map((o) => o.claimedByInviteId).filter((x): x is string => !!x)),
  ];
  const batchOfferClaimers =
    batchOfferClaimerInviteIds.length > 0
      ? await prisma.evInvite.findMany({
          where: { id: { in: batchOfferClaimerInviteIds } },
          select: {
            id: true,
            adHocName: true,
            partner: { select: { companyName: true } },
          },
        })
      : [];
  const claimerById = Object.fromEntries(
    batchOfferClaimers.map((i) => [i.id, i.partner?.companyName ?? i.adHocName ?? 'an invitee']),
  );
  const batchOfferRows = batchOffers.map((o) => ({
    id: o.id,
    ticketTypeName: o.ticketType.name,
    status: o.status as 'OPEN' | 'CLAIMED' | 'EXPIRED' | 'CANCELED',
    expiresAt: o.expiresAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
    recipientCount: o._count.recipients,
    claimedByName: o.claimedByInviteId ? (claimerById[o.claimedByInviteId] ?? null) : null,
  }));

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white">
        <div className="flex items-start gap-4 px-6 py-4">
          <Link
            href="/events"
            className="mt-1 flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            title="Back to events"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Pill color={statusColor(event.status)} tone="soft">
                {event.status}
              </Pill>
              <span className="font-mono text-[11px] text-gray-400">{event.publicId}</span>
              <span className="text-[11px] text-gray-500">· {event.market.name}</span>
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold text-gray-900">{event.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 text-gray-400" />
                {formatWhen(event.startsAt, event.timezone)} –{' '}
                {formatTime(event.endsAt, event.timezone)}
              </span>
              {event.venueName && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-gray-400" />
                  {event.venueName}
                </span>
              )}
              {primary && (
                <span className="inline-flex items-center gap-1">
                  <Ticket className="h-3 w-3 text-gray-400" />
                  {availableCount} of {primary.capacity} {primary.name} available
                </span>
              )}
              {event._count.hosts > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3 text-gray-400" />
                  {event._count.hosts} host{event._count.hosts === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
          <EventHeaderActions
            eventId={event.id}
            canEdit={canEdit}
            canceled={Boolean(event.canceledAt)}
          />
        </div>

        <div className="flex items-center gap-1 px-6">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/events/${event.id}?tab=${t.id}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-canvas">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <OverviewTab event={event} canEdit={canEdit} markets={[event.market]} />
            <div className="space-y-5">
              <TicketTypesCard event={event} canEdit={canEdit} />
              <BatchOffersCard eventId={event.id} offers={batchOfferRows} canEdit={canEdit} />
            </div>
          </div>
        )}
        {tab === 'invites' && <InvitesTab event={event} canEdit={canEdit} />}
        {tab === 'subevents' && <SubEventsTab event={event} canEdit={canEdit} />}
        {tab === 'hosts' && <HostsTab event={event} reps={reps} canEdit={canEdit} />}
        {tab === 'dashboard' && (
          <div className="p-6">
            <div className="mx-auto max-w-2xl rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
              Dashboard (funnel, response times, cost) ships in EV-9 once real invite data lights
              up. For now, the Overview tab shows capacity + the Invites tab shows live status.
            </div>
          </div>
        )}
        {tab === 'activity' && <ActivityTab eventId={event.id} />}
      </div>
    </div>
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
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}
