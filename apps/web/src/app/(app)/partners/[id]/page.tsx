import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Card, Pill, Avatar, EmptyState, cn } from '@partnerradar/ui';
import { PARTNER_TYPE_LABELS, STAGE_COLORS, STAGE_LABELS } from '@partnerradar/types';
import { stormClient, type StormProject, type PartnerStats } from '@partnerradar/integrations';
import { auth } from '@/auth';
import {
  ArrowLeft,
  MapPin,
  ExternalLink,
  Users,
  Mail,
  Phone,
  Calendar,
  ListTodo,
  Paperclip,
  PartyPopper,
} from 'lucide-react';
import { PartnerActionBar } from './PartnerDetailClient';
import {
  NewContactButton,
  NewTaskButton,
  NewAppointmentButton,
  NewEventButton,
  NewExpenseButton,
  AIDraftButton,
  ContactRowActions,
  TaskCheckbox,
} from './PartnerDrawers';
import { isAIConfigured } from '@partnerradar/ai';
import { ActivityRail } from './ActivityRail';
import { TrackPartnerView } from '@/components/RecentPartners';
import { PartnerStatsRow } from './PartnerStatsRow';
import { LinkedProjectsTable } from './LinkedProjectsTable';
import { PartnerEventsCard } from './PartnerEventsCard';

export const dynamic = 'force-dynamic';

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  const { id } = await params;

  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: { select: { id: true, name: true, avatarColor: true } },
        },
      },
      tasks: {
        orderBy: [{ completedAt: 'asc' }, { dueAt: 'asc' }],
      },
      appointments: {
        orderBy: { startsAt: 'desc' },
      },
      assignedRep: { select: { id: true, name: true, avatarColor: true } },
      market: true,
    },
  });
  if (!partner) notFound();

  // Events live in their own table that ships with the Storm-parity
  // redesign. Fetch defensively so a pre-migration DB doesn't 500 the
  // page — just shows the empty-state card instead.
  type EventRow = {
    id: string;
    type: string;
    title: string;
    location: string | null;
    startsAt: Date;
    endsAt: Date | null;
  };
  let events: EventRow[] = [];
  try {
    events = await prisma.event.findMany({
      where: { partnerId: partner.id },
      orderBy: { startsAt: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        location: true,
        startsAt: true,
        endsAt: true,
      },
    });
  } catch (err) {
    console.warn(
      '[partner-detail] Event table not available yet — run `pnpm --filter @partnerradar/db prisma:push` to enable. Falling back to empty list.',
      err,
    );
  }

  // Spend + revenue for the Financial Overview card. Spend aggregates
  // every expense except rejected ones; revenue pulls from RevenueAttribution
  // which the 6-hour Storm sync job populates (Phase 5). Graceful on empty.
  const [partnerSpendAgg, partnerRevenueAgg] = await Promise.all([
    prisma.expense.aggregate({
      where: { partnerId: partner.id, approvalStatus: { not: 'REJECTED' } },
      _sum: { amount: true },
    }),
    prisma.revenueAttribution
      .aggregate({
        where: { partnerId: partner.id },
        _sum: { amount: true },
      })
      .catch(() => ({ _sum: { amount: null } })),
  ]);
  const partnerTotalSpent = Number(partnerSpendAgg._sum.amount ?? 0);
  const partnerRevenueAttributed = Number(partnerRevenueAgg._sum.amount ?? 0);

  // Admin-managed appointment type catalog — gracefully degrades to an
  // empty list (which the NewAppointmentButton falls back to a text input
  // for) if the AppointmentType table hasn't been pushed yet.
  let appointmentTypes: Array<{ id: string; name: string; durationMinutes: number }> = [];
  try {
    appointmentTypes = await prisma.appointmentType.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, durationMinutes: true },
      orderBy: { name: 'asc' },
    });
  } catch (err) {
    console.warn(
      '[partner-detail] AppointmentType table not available yet — run prisma:push.',
      err,
    );
  }

  // Permission gate
  const inMarket = session.user.markets.includes(partner.marketId);
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  const isOwner = partner.assignedRepId === session.user.id;
  const canView = inMarket && (isManagerPlus || isOwner || partner.assignedRepId === null);
  if (!canView) notFound();
  const canEdit = inMarket && (isManagerPlus || isOwner);
  const canActivate = isManagerPlus && !partner.archivedAt;

  // Storm Cloud — only load when the partner has been activated. Run in
  // parallel, tolerate failures silently so the rest of the page renders.
  let stormProjects: StormProject[] = [];
  let stormStats: PartnerStats | null = null;
  if (partner.stormCloudId) {
    const client = stormClient();
    const [projectsRes, statsRes] = await Promise.allSettled([
      client.listProjects(partner.stormCloudId),
      client.getPartnerStats(partner.stormCloudId),
    ]);
    if (projectsRes.status === 'fulfilled') stormProjects = projectsRes.value;
    if (statsRes.status === 'fulfilled') stormStats = statsRes.value;
  }

  const primaryContact = partner.contacts.find((c) => c.isPrimary) ?? partner.contacts[0];
  const primaryEmail =
    (primaryContact?.emails as Array<{ address: string; primary?: boolean }> | null)?.find(
      (e) => e.primary,
    )?.address ?? (primaryContact?.emails as Array<{ address: string }> | null)?.[0]?.address;
  const primaryPhone =
    (primaryContact?.phones as Array<{ number: string; primary?: boolean }> | null)?.find(
      (p) => p.primary,
    )?.number ?? (primaryContact?.phones as Array<{ number: string }> | null)?.[0]?.number;

  const addressLine = [partner.address, partner.city, partner.state, partner.zip]
    .filter(Boolean)
    .join(', ');

  const openTaskCount = partner.tasks.filter((t) => !t.completedAt).length;
  const now = Date.now();
  const upcomingAppointmentCount = partner.appointments.filter(
    (a) => new Date(a.startsAt).getTime() >= now,
  ).length;

  // Serialize Date → ISO strings for the Comments rail (tabs removed —
  // Appointments + Tasks have dedicated cards in the 2×2 grid below)
  const activitiesSer = partner.activities.map((a) => ({
    id: a.id,
    type: a.type,
    body: a.body,
    createdAt: a.createdAt.toISOString(),
    user: { id: a.user.id, name: a.user.name, avatarColor: a.user.avatarColor },
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header strip ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-3">
        <Link
          href="/partners"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Back to partners"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700">
          {partner.publicId}
        </span>
        {/* Push this partner onto the localStorage Recent list. Renders
            nothing; just runs an effect on mount. */}
        <TrackPartnerView
          id={partner.id}
          publicId={partner.publicId}
          companyName={partner.companyName}
        />
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold tracking-tight text-gray-900">
            {partner.companyName}
          </h1>
          {addressLine && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{addressLine}</span>
            </div>
          )}
        </div>
        <Pill color="#2563eb" tone="soft" className="ml-2">
          {PARTNER_TYPE_LABELS[partner.partnerType]}
        </Pill>
        {partner.stormCloudId && (
          <Pill color="#10b981" tone="soft">
            Synced · Storm Cloud
          </Pill>
        )}
        <div className="ml-auto flex items-center gap-2">
          {canEdit && <AIDraftButton partnerId={partner.id} aiConfigured={isAIConfigured()} />}
          <PartnerActionBar
            partnerId={partner.id}
            currentStage={partner.stage}
            canActivate={canActivate}
            canEdit={canEdit}
          />
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5 pb-12">
        {/* Outer 2-col grid: LEFT = all data cards, RIGHT = full-height Comments rail */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(720px,2fr)]">
          <div className="space-y-4">
            {/* Top row — Contacts | Info */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
              {/* Contacts */}
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-500" />
                    Contacts
                  </span>
                }
              >
                {partner.contacts.length === 0 ? (
                  <EmptyState
                    title="No contacts yet"
                    description="Add a broker, owner, or decision maker."
                  />
                ) : (
                  <ul className="space-y-3">
                    {partner.contacts.map((c) => {
                      const emails =
                        (c.emails as Array<{ address: string; label?: string }> | null) ?? [];
                      const phones =
                        (c.phones as Array<{ number: string; label?: string }> | null) ?? [];
                      return (
                        <li key={c.id} className="group flex items-start gap-2">
                          <Avatar name={c.name} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[13px] font-semibold text-gray-900">
                                {c.name}
                              </span>
                              {c.isPrimary && (
                                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-label text-amber-700">
                                  Primary
                                </span>
                              )}
                            </div>
                            {c.title && <div className="text-xs text-gray-500">{c.title}</div>}
                            {emails[0] && (
                              <a
                                href={`mailto:${emails[0].address}`}
                                className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                              >
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{emails[0].address}</span>
                              </a>
                            )}
                            {phones[0] && (
                              <a
                                href={`tel:${phones[0].number}`}
                                className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-900"
                              >
                                <Phone className="h-3 w-3" />
                                <span>{phones[0].number}</span>
                              </a>
                            )}
                          </div>
                          {canEdit && (
                            <div className="opacity-0 transition group-hover:opacity-100">
                              <ContactRowActions
                                partnerId={partner.id}
                                contactId={c.id}
                                isPrimary={c.isPrimary}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {canEdit && <NewContactButton partnerId={partner.id} />}
              </Card>

              {/* Info */}
              <Card title="Partner info">
                <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
                  <InfoRow label="Type" value={PARTNER_TYPE_LABELS[partner.partnerType]} />
                  <InfoRow label="Stage">
                    <Pill color={STAGE_COLORS[partner.stage]} tone="soft">
                      {STAGE_LABELS[partner.stage]}
                    </Pill>
                  </InfoRow>
                  <InfoRow label="Market" value={partner.market.name} />
                  <InfoRow label="Assigned">
                    {partner.assignedRep ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar
                          name={partner.assignedRep.name}
                          color={partner.assignedRep.avatarColor}
                          size="sm"
                        />
                        <span className="text-gray-900">{partner.assignedRep.name}</span>
                      </div>
                    ) : (
                      <span className="text-amber-600">Unassigned</span>
                    )}
                  </InfoRow>
                  <InfoRow label="Primary email" value={primaryEmail ?? '—'} />
                  <InfoRow label="Primary phone" value={primaryPhone ?? '—'} />
                  <InfoRow label="Address" value={addressLine || '—'} />
                  {partner.website && (
                    <InfoRow label="Website">
                      <a
                        href={partner.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        {partner.website.replace(/^https?:\/\//, '')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </InfoRow>
                  )}
                  {partner.stormCloudId && (
                    <InfoRow label="Storm ID" value={partner.stormCloudId} />
                  )}
                  {partner.activatedAt && (
                    <InfoRow
                      label="Activated"
                      value={new Date(partner.activatedAt).toLocaleDateString()}
                    />
                  )}
                  {partner.notes && (
                    <InfoRow label="Notes">
                      <p className="whitespace-pre-wrap text-gray-700">{partner.notes}</p>
                    </InfoRow>
                  )}
                </dl>
              </Card>
            </div>

            {/* Partner performance — MTD / YTD / Last year / Lifetime */}
            <PartnerStatsRow stats={stormStats} />

            {/* 2×2 grid — Tasks / Appointments / Events / Files */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <ListTodo className="h-4 w-4 text-gray-500" />
                    Tasks
                    {openTaskCount > 0 && (
                      <span className="text-[10.5px] uppercase tracking-label text-gray-400">
                        {openTaskCount} open
                      </span>
                    )}
                  </span>
                }
              >
                {partner.tasks.filter((t) => !t.completedAt).length === 0 ? (
                  <EmptyState title="Nothing due" description="Tasks you create land here." />
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {partner.tasks
                      .filter((t) => !t.completedAt)
                      .map((task) => (
                        <li key={task.id} className="flex items-start gap-2 py-2">
                          {canEdit && <TaskCheckbox taskId={task.id} />}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900">{task.title}</div>
                            {task.dueAt && (
                              <div className="text-xs text-gray-500">
                                Due {new Date(task.dueAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                          {task.priority === 'HIGH' && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-label text-amber-700">
                              High
                            </span>
                          )}
                          {task.priority === 'URGENT' && (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-label text-red-700">
                              Urgent
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
                {canEdit && <NewTaskButton partnerId={partner.id} />}
              </Card>

              <Card
                title={
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    Appointments
                  </span>
                }
              >
                {partner.appointments.length === 0 ? (
                  <EmptyState title="No appointments" description="1:1 meetings land here." />
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {partner.appointments.slice(0, 5).map((a) => (
                      <li key={a.id} className="py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-gray-900">{a.title}</span>
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-label text-blue-700">
                            {a.type}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(a.startsAt).toLocaleString()}
                          {a.location && ` · ${a.location}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && (
                  <NewAppointmentButton
                    partnerId={partner.id}
                    appointmentTypes={appointmentTypes}
                  />
                )}
              </Card>

              <Card
                title={
                  <span className="flex items-center gap-2">
                    <PartyPopper className="h-4 w-4 text-gray-500" />
                    Events
                    <span className="text-[10.5px] uppercase tracking-label text-gray-400">
                      Chamber · Broker opens · Mixers
                    </span>
                  </span>
                }
              >
                {events.length === 0 ? (
                  <EmptyState
                    title="No events yet"
                    description="Chamber mixers, broker opens, lunch-and-learns."
                  />
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {events.slice(0, 5).map((e) => (
                      <li key={e.id} className="py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-gray-900">{e.title}</span>
                          <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-label text-pink-700">
                            {e.type}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(e.startsAt).toLocaleString()}
                          {e.location && ` · ${e.location}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && <NewEventButton partnerId={partner.id} />}
              </Card>

              <Card
                title={
                  <span className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-gray-500" />
                    Expenses & Files
                  </span>
                }
              >
                <FinancialOverviewCard
                  totalSpent={partnerTotalSpent}
                  revenueAttributed={partnerRevenueAttributed}
                />
                {canEdit && (
                  <NewExpenseButton
                    partnerId={partner.id}
                    r2Configured={Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET)}
                  />
                )}
                <p className="mt-2 text-[11px] text-gray-400">
                  Files + receipts upload once Cloudflare R2 is connected.
                </p>
              </Card>
            </div>
          </div>

          {/* RIGHT column — full-height Comments rail */}
          <div className="lg:sticky lg:top-0 lg:self-stretch">
            <ActivityRail partnerId={partner.id} canEdit={canEdit} activities={activitiesSer} />
          </div>
        </div>

        {/* Linked projects — Storm-style roster at the bottom */}
        <LinkedProjectsTable projects={stormProjects} activated={Boolean(partner.stormCloudId)} />

        {/* Event history — only renders if this partner has been invited to anything. */}
        <PartnerEventsCard partnerId={partner.id} />
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <dt className={cn('py-1 text-[11px] uppercase tracking-label text-gray-500')}>{label}</dt>
      <dd className="py-1 text-gray-900">{children ?? value}</dd>
    </>
  );
}

function FinancialOverviewCard({
  totalSpent,
  revenueAttributed,
}: {
  totalSpent: number;
  revenueAttributed: number;
}) {
  const hasSpend = totalSpent > 0;
  const hasRevenue = revenueAttributed > 0;
  const roi = hasSpend ? ((revenueAttributed - totalSpent) / totalSpent) * 100 : null;
  const roiTone =
    roi == null
      ? 'text-gray-400'
      : roi >= 100
        ? 'text-green-700'
        : roi >= 0
          ? 'text-amber-700'
          : 'text-red-700';
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return (
    <div className="mb-2 grid grid-cols-3 gap-2 rounded-md border border-card-border bg-gray-50 p-3 text-center">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-label text-gray-500">
          Spent
        </div>
        <div className="mt-0.5 text-sm font-semibold text-gray-900">
          {hasSpend ? fmt(totalSpent) : '—'}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-label text-gray-500">
          Revenue
        </div>
        <div className="mt-0.5 text-sm font-semibold text-gray-900">
          {hasRevenue ? fmt(revenueAttributed) : '—'}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-label text-gray-500">ROI</div>
        <div className={`mt-0.5 text-sm font-semibold tabular-nums ${roiTone}`}>
          {roi == null ? '—' : `${roi >= 0 ? '+' : ''}${roi.toFixed(0)}%`}
        </div>
      </div>
    </div>
  );
}
