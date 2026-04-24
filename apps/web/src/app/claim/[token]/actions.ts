'use server';

/**
 * Public batch-offer claim actions — no auth; the claim token is the
 * authentication. A single winning row decides who gets the freed
 * ticket (SPEC_EVENTS §4.4). Losing claimers can opt in to future
 * offers via `optIn`.
 */

import { revalidatePath } from 'next/cache';
import { claimBatchOffer, optInFutureOffers } from '@/lib/events/cascade';
import { prisma } from '@partnerradar/db';

export async function claim(
  token: string,
): Promise<
  | { ok: true; status: 'won'; inviteId: string }
  | { ok: false; reason: 'not_found' | 'already_claimed' | 'expired' | 'canceled' | 'no_capacity' }
> {
  // Stamp clickedAt before we race to claim — even losers will have
  // this set so reporting can show click-through rate.
  await prisma.evBatchOfferRecipient
    .updateMany({
      where: { claimToken: token, clickedAt: null },
      data: { clickedAt: new Date() },
    })
    .catch(() => null);

  const res = await claimBatchOffer(token);
  revalidatePath(`/claim/${token}`);
  if (res.ok) {
    return { ok: true, status: 'won', inviteId: res.inviteId };
  }
  return { ok: false, reason: res.reason };
}

export async function optIn(token: string): Promise<{ ok: boolean }> {
  const ok = await optInFutureOffers(token);
  revalidatePath(`/claim/${token}`);
  return { ok };
}
