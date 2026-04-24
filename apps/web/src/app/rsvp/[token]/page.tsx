/**
 * Public RSVP page — no auth.
 *
 * Renders the hero + event info + ticket list + action buttons. All
 * the interactive bits (accept-with-changes, confirmation flow,
 * plus-one input) live in RsvpClient.
 */

import { notFound } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { RsvpClient } from './RsvpClient';
import { tenant } from '@partnerradar/config';

export const dynamic = 'force-dynamic';

export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
          startsAt: true,
          endsAt: true,
          timezone: true,
          status: true,
          canceledAt: true,
          canceledReason: true,
          defaultPlusOnesAllowed: true,
        },
      },
      partner: { select: { companyName: true } },
      ticketAssignments: {
        include: {
          ticketType: { select: { id: true, name: true, isPrimary: true, description: true } },
        },
      },
    },
  });
  if (!invite) notFound();

  const t = tenant();
  const firstName = invite.partner?.companyName ?? invite.adHocName?.split(/\s+/)[0] ?? 'there';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-lg">
        <header className="mb-4 text-center">
          <p className="text-[11px] uppercase tracking-label text-gray-500">{t.brandName}</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">You're invited</h1>
        </header>

        <RsvpClient
          token={token}
          invite={{
            id: invite.id,
            status: invite.status,
            plusOneAllowed: invite.plusOneAllowed,
            plusOneName: invite.plusOneName,
            expiresAt: invite.expiresAt?.toISOString() ?? null,
            recipientLabel: invite.partner?.companyName ?? invite.adHocName ?? 'Guest',
            firstName,
            ticketAssignments: invite.ticketAssignments.map((a) => ({
              id: a.id,
              status: a.status,
              quantity: a.quantity,
              ticketType: a.ticketType,
            })),
          }}
          event={{
            id: invite.event.id,
            name: invite.event.name,
            description: invite.event.description,
            venueName: invite.event.venueName,
            venueAddress: invite.event.venueAddress,
            startsAt: invite.event.startsAt.toISOString(),
            endsAt: invite.event.endsAt.toISOString(),
            timezone: invite.event.timezone,
            canceledAt: invite.event.canceledAt?.toISOString() ?? null,
            canceledReason: invite.event.canceledReason,
          }}
          tenant={{
            brandName: t.brandName,
            legalName: t.legalName,
            physicalAddress: t.physicalAddress,
          }}
        />
      </div>
    </div>
  );
}
