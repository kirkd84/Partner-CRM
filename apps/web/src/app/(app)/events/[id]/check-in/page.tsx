/**
 * /events/[id]/check-in — mobile-first host check-in page.
 *
 * Renders SSR so the initial list paints fast on a phone on spotty
 * hotel wifi. All interactive behavior (scanner, search, walk-in
 * drawer) lives in CheckInClient.
 *
 * Access: ADMIN, MANAGER-in-market, event creator, or host. Anyone
 * else gets redirected back to the event page.
 */

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@partnerradar/db';
import { ArrowLeft } from 'lucide-react';
import { CheckInClient } from './CheckInClient';

export const dynamic = 'force-dynamic';

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { id } = await params;

  const event = await prisma.evEvent.findUnique({
    where: { id },
    include: {
      ticketTypes: {
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          isPrimary: true,
          capacity: true,
          internalAllocation: true,
        },
      },
      hosts: { select: { userId: true } },
    },
  });
  if (!event) notFound();

  const role = session.user.role;
  const markets = session.user.markets ?? [];
  if (role !== 'ADMIN' && !markets.includes(event.marketId)) redirect(`/events/${event.id}`);
  const isMgrPlus = role === 'MANAGER' || role === 'ADMIN';
  const isHost = event.hosts.some((h) => h.userId === session.user.id);
  const isCreator = event.createdBy === session.user.id;
  if (!isMgrPlus && !isCreator && !isHost) redirect(`/events/${event.id}`);

  // Confirmed invites with their assignments.
  const confirmed = await prisma.evInvite.findMany({
    where: {
      eventId: event.id,
      status: 'CONFIRMED',
    },
    include: {
      partner: { select: { id: true, companyName: true } },
      ticketAssignments: {
        include: {
          ticketType: { select: { id: true, name: true, isPrimary: true } },
        },
      },
    },
    orderBy: [{ partner: { companyName: 'asc' } }, { adHocName: 'asc' }],
    take: 500,
  });

  const totalPrimaryAssignments = confirmed.reduce(
    (sum, i) => sum + i.ticketAssignments.filter((a) => a.ticketType.isPrimary).length,
    0,
  );
  const checkedInPrimary = confirmed.reduce(
    (sum, i) =>
      sum + i.ticketAssignments.filter((a) => a.ticketType.isPrimary && !!a.checkedInAt).length,
    0,
  );

  const attendees = confirmed.map((i) => ({
    inviteId: i.id,
    name: i.partner?.companyName ?? i.adHocName ?? 'Guest',
    plusOneName: i.plusOneName,
    plusOneAllowed: i.plusOneAllowed,
    partnerId: i.partner?.id ?? null,
    ticketAssignments: i.ticketAssignments.map((a) => ({
      id: a.id,
      status: a.status,
      ticketTypeId: a.ticketType.id,
      ticketName: a.ticketType.name,
      isPrimary: a.ticketType.isPrimary,
      checkedInAt: a.checkedInAt?.toISOString() ?? null,
    })),
  }));

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Link
            href={`/events/${event.id}`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            title="Back to event"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-label text-gray-500">Check-in</p>
            <h1 className="truncate text-base font-semibold text-gray-900">{event.name}</h1>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold tabular-nums text-gray-900">
              {checkedInPrimary}
              <span className="text-gray-400">/{totalPrimaryAssignments}</span>
            </p>
            <p className="text-[10px] uppercase tracking-label text-gray-500">Checked in</p>
          </div>
        </div>
      </header>

      <CheckInClient
        eventId={event.id}
        eventName={event.name}
        attendees={attendees}
        ticketTypes={event.ticketTypes.map((tt) => ({
          id: tt.id,
          name: tt.name,
          isPrimary: tt.isPrimary,
        }))}
      />
    </div>
  );
}
