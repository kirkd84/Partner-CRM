import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Card, Pill, Avatar, ActivityItem, EmptyState, cn } from '@partnerradar/ui';
import { PARTNER_TYPE_LABELS, STAGE_COLORS, STAGE_LABELS } from '@partnerradar/types';
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
} from 'lucide-react';
import { PartnerActionBar, CommentComposer } from './PartnerDetailClient';
import {
  NewContactButton,
  NewTaskButton,
  NewAppointmentButton,
  ContactRowActions,
  TaskCheckbox,
} from './PartnerDrawers';

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
        where: { completedAt: null },
        orderBy: { dueAt: 'asc' },
      },
      appointments: {
        orderBy: { startsAt: 'asc' },
      },
      assignedRep: { select: { id: true, name: true, avatarColor: true } },
      market: true,
    },
  });
  if (!partner) notFound();

  // Permission gate
  const inMarket = session.user.markets.includes(partner.marketId);
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  const isOwner = partner.assignedRepId === session.user.id;
  const canView = inMarket && (isManagerPlus || isOwner || partner.assignedRepId === null);
  if (!canView) notFound();
  const canEdit = inMarket && (isManagerPlus || isOwner);
  const canActivate = isManagerPlus && !partner.archivedAt;

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
        <div className="ml-auto">
          <PartnerActionBar
            partnerId={partner.id}
            currentStage={partner.stage}
            canActivate={canActivate}
            canEdit={canEdit}
          />
        </div>
      </div>

      {/* ── Body: 3-column top, then bottom split ────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_360px]">
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
              {partner.stormCloudId && <InfoRow label="Storm ID" value={partner.stormCloudId} />}
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

          {/* Activity */}
          <Card
            title={
              <span className="flex items-center gap-2">
                Activity
                <span className="text-[10.5px] uppercase tracking-label text-gray-400">
                  {partner.activities.length}
                </span>
              </span>
            }
          >
            {canEdit && <CommentComposer partnerId={partner.id} canComment={canEdit} />}
            <div className="mt-3">
              {partner.activities.length === 0 ? (
                <EmptyState title="No activity yet" description="Post the first comment above." />
              ) : (
                partner.activities.map((a) => (
                  <ActivityItem
                    key={a.id}
                    userName={a.user.name}
                    userColor={a.user.avatarColor}
                    verb={verbFor(a.type)}
                    body={a.body ?? undefined}
                    timestamp={timeago(a.createdAt)}
                  />
                ))
              )}
            </div>
          </Card>
        </div>

        {/* ── Bottom split: tasks + appointments + files ────────────── */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card
            title={
              <span className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-gray-500" />
                Tasks
              </span>
            }
          >
            {partner.tasks.length === 0 ? (
              <EmptyState title="Nothing due" description="Tasks you create land here." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {partner.tasks.map((task) => (
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
              <EmptyState title="No appointments" description="Calendar sync lands in Phase 4." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {partner.appointments.map((a) => (
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
            {canEdit && <NewAppointmentButton partnerId={partner.id} />}
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-gray-500" />
                Files
              </span>
            }
          >
            <EmptyState
              title="No files"
              description="Cloudflare R2 uploads arrive when creds are wired."
            />
          </Card>
        </div>
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

function verbFor(type: string): string {
  switch (type) {
    case 'COMMENT':
      return 'commented';
    case 'CALL':
      return 'logged a call';
    case 'SMS_OUT':
      return 'sent SMS';
    case 'EMAIL_OUT':
      return 'emailed';
    case 'VISIT':
      return 'visited';
    case 'MEETING_HELD':
      return 'met';
    case 'STAGE_CHANGE':
      return 'moved stage';
    case 'ACTIVATION':
      return 'activated';
    case 'CLAIM':
      return 'claimed';
    case 'ASSIGNMENT':
      return 'assigned';
    default:
      return 'updated';
  }
}

function timeago(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
