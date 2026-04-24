/**
 * Invites tab — server component that loads queue + sent rows and hands
 * both over to the client-side InvitesClient for drag-drop reordering +
 * batch send + ad-hoc add.
 *
 * We load partners available in the event's market so the "add to
 * queue" panel can filter to just the relevant rows. Already-queued
 * partners are excluded up-front to avoid the "already exists" flash
 * on create.
 */

import { prisma } from '@partnerradar/db';
import { InvitesClient } from './InvitesClient';

interface TicketType {
  id: string;
  name: string;
  capacity: number;
  isPrimary: boolean;
}

export async function InvitesTab({
  event,
  canEdit,
}: {
  event: {
    id: string;
    marketId: string;
    timezone: string;
    startsAt: Date;
    ticketTypes: TicketType[];
    defaultPlusOnesAllowed: boolean;
    canceledAt: Date | null;
  };
  canEdit: boolean;
}) {
  const [invites, alreadyInvitedPartnerIds, allPartners, fallbackPartners, ticketAssignmentCounts] =
    await Promise.all([
      prisma.evInvite.findMany({
        where: { eventId: event.id },
        orderBy: [{ queueOrder: 'asc' }],
        include: {
          partner: { select: { id: true, companyName: true, city: true, state: true } },
          ticketAssignments: {
            select: { id: true, ticketTypeId: true, status: true, quantity: true },
          },
        },
      }),
      prisma.evInvite.findMany({
        where: { eventId: event.id, partnerId: { not: null } },
        select: { partnerId: true },
      }),
      prisma.partner.findMany({
        where: { marketId: event.marketId, archivedAt: null },
        orderBy: { companyName: 'asc' },
        select: {
          id: true,
          companyName: true,
          city: true,
          state: true,
          autoWaitlistEligible: true,
          waitlistPriority: true,
        },
        take: 500,
      }),
      prisma.partner.findMany({
        where: {
          marketId: event.marketId,
          archivedAt: null,
          autoWaitlistEligible: true,
        },
        orderBy: [{ waitlistPriority: 'asc' }, { companyName: 'asc' }],
        select: {
          id: true,
          companyName: true,
          waitlistPriority: true,
        },
        take: 20,
      }),
      prisma.evTicketAssignment.groupBy({
        by: ['ticketTypeId', 'status'],
        where: { ticketType: { eventId: event.id } },
        _sum: { quantity: true },
      }),
    ]);

  const takenByTicket = new Map<string, number>();
  for (const row of ticketAssignmentCounts) {
    if (row.status === 'TENTATIVE' || row.status === 'CONFIRMED') {
      takenByTicket.set(
        row.ticketTypeId,
        (takenByTicket.get(row.ticketTypeId) ?? 0) + (row._sum.quantity ?? 0),
      );
    }
  }

  const invitedSet = new Set(
    alreadyInvitedPartnerIds.map((r) => r.partnerId).filter(Boolean) as string[],
  );
  const selectablePartners = allPartners.filter((p) => !invitedSet.has(p.id));

  return (
    <InvitesClient
      eventId={event.id}
      eventTimezone={event.timezone}
      eventStartsAt={event.startsAt.toISOString()}
      ticketTypes={event.ticketTypes}
      takenByTicket={Object.fromEntries(takenByTicket)}
      defaultPlusOnes={event.defaultPlusOnesAllowed}
      canEdit={canEdit && !event.canceledAt}
      invites={invites.map((i) => ({
        id: i.id,
        status: i.status,
        queueTier: i.queueTier,
        queueOrder: i.queueOrder,
        plusOneAllowed: i.plusOneAllowed,
        plusOneName: i.plusOneName,
        expiresAt: i.expiresAt?.toISOString() ?? null,
        sentAt: i.sentAt?.toISOString() ?? null,
        confirmedAt: i.confirmedAt?.toISOString() ?? null,
        partner: i.partner
          ? {
              id: i.partner.id,
              companyName: i.partner.companyName,
              city: i.partner.city,
              state: i.partner.state,
            }
          : null,
        adHocName: i.adHocName,
        adHocEmail: i.adHocEmail,
        adHocPhone: i.adHocPhone,
        ticketAssignments: i.ticketAssignments,
      }))}
      partnersAvailable={selectablePartners}
      fallbackPreview={fallbackPartners}
    />
  );
}
