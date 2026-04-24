/**
 * Public batch-offer claim page — no auth.
 *
 * Shape of flow (SPEC_EVENTS §4.4 + §6.3):
 *   • GET  — we look up the offer state:
 *       – OPEN + this recipient hasn't clicked → "Claim it" button
 *       – OPEN + this recipient already claimed (won) → success page
 *       – CLAIMED by someone else → miss page w/ "notify me next time"
 *       – EXPIRED / CANCELED → same miss page, different copy
 *
 * All interactive bits live in the client component. This page just
 * fetches context and hands a typed snapshot down.
 */

import { notFound } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { tenant } from '@partnerradar/config';
import { ClaimClient } from './ClaimClient';

export const dynamic = 'force-dynamic';

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const recipient = await prisma.evBatchOfferRecipient.findUnique({
    where: { claimToken: token },
    include: {
      batchOffer: {
        include: {
          event: {
            select: {
              id: true,
              name: true,
              startsAt: true,
              timezone: true,
              venueName: true,
              venueAddress: true,
            },
          },
          ticketType: { select: { id: true, name: true } },
        },
      },
      invite: {
        select: {
          id: true,
          partner: { select: { companyName: true } },
          adHocName: true,
        },
      },
    },
  });
  if (!recipient) notFound();

  const t = tenant();
  const offer = recipient.batchOffer;
  const now = new Date();
  const expired = offer.expiresAt.getTime() < now.getTime();

  type ViewState =
    | { kind: 'open' }
    | { kind: 'already-won' }
    | { kind: 'already-lost' }
    | { kind: 'claimed-by-other' }
    | { kind: 'expired' }
    | { kind: 'canceled' };

  let state: ViewState;
  if (recipient.wonRaceAt) state = { kind: 'already-won' };
  else if (offer.status === 'CLAIMED') state = { kind: 'claimed-by-other' };
  else if (offer.status === 'CANCELED') state = { kind: 'canceled' };
  else if (offer.status === 'EXPIRED' || expired) state = { kind: 'expired' };
  else if (recipient.lostRaceAt) state = { kind: 'already-lost' };
  else state = { kind: 'open' };

  const firstName =
    recipient.invite.partner?.companyName ?? recipient.invite.adHocName?.split(/\s+/)[0] ?? 'there';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-lg">
        <header className="mb-4 text-center">
          <p className="text-[11px] uppercase tracking-label text-gray-500">{t.brandName}</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            {state.kind === 'open' ? 'One just opened up' : 'Batch offer'}
          </h1>
        </header>

        <ClaimClient
          token={token}
          state={state}
          ticketName={offer.ticketType.name}
          eventName={offer.event.name}
          eventStartsAt={offer.event.startsAt.toISOString()}
          eventTimezone={offer.event.timezone}
          venueName={offer.event.venueName}
          venueAddress={offer.event.venueAddress}
          offerExpiresAt={offer.expiresAt.toISOString()}
          firstName={firstName}
          wantsFutureOffers={recipient.wantsFutureOffers}
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
