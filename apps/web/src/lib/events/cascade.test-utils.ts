/**
 * Stress-test helpers for the batch-offer race.
 *
 * Usage — invoke from a Node REPL or an admin script when Kirk wants
 * to verify concurrent-claim safety end to end:
 *
 *   import { runConcurrentClaimStress } from '@/lib/events/cascade.test-utils';
 *   await runConcurrentClaimStress('<batchOfferId>');
 *
 * Or call the exposed admin API route (see /api/admin/batch-offer-stress).
 * The API route is gated to ADMIN role only.
 *
 * What it does:
 *   1. Loads every recipient of the given batch offer
 *   2. Fires N concurrent claim() calls against the same Postgres
 *      server (via Prisma $transaction + FOR UPDATE)
 *   3. Asserts exactly one succeeds; returns the distribution of
 *      outcomes for reporting
 *
 * If the result shows >1 winners, the locking strategy is broken and
 * we have a bug to hunt down. In practice, Postgres row locks + the
 * conditional status update in `claimBatchOffer` make the race
 * single-winner-by-construction.
 */

import { prisma } from '@partnerradar/db';
import { claimBatchOffer } from './cascade';

export interface StressResult {
  batchOfferId: string;
  attempted: number;
  wins: number;
  alreadyClaimed: number;
  expired: number;
  notFound: number;
  noCapacity: number;
  other: number;
  ok: boolean; // exactly one winner
  durationMs: number;
}

export async function runConcurrentClaimStress(batchOfferId: string): Promise<StressResult> {
  const recipients = await prisma.evBatchOfferRecipient.findMany({
    where: { batchOfferId },
    select: { claimToken: true },
  });
  if (recipients.length === 0) {
    return {
      batchOfferId,
      attempted: 0,
      wins: 0,
      alreadyClaimed: 0,
      expired: 0,
      notFound: 0,
      noCapacity: 0,
      other: 0,
      ok: false,
      durationMs: 0,
    };
  }

  const startedAt = Date.now();
  // Fire all claims simultaneously — no staggering. The goal is to
  // maximize contention for the row lock.
  const outcomes = await Promise.all(
    recipients.map((r) =>
      claimBatchOffer(r.claimToken).catch((err): { ok: false; reason: 'other' } => {
        console.warn('[stress] claim threw', err);
        return { ok: false, reason: 'other' };
      }),
    ),
  );
  const durationMs = Date.now() - startedAt;

  let wins = 0;
  let alreadyClaimed = 0;
  let expired = 0;
  let notFound = 0;
  let noCapacity = 0;
  let other = 0;
  for (const o of outcomes) {
    if (o.ok) {
      wins++;
      continue;
    }
    switch (o.reason) {
      case 'already_claimed':
        alreadyClaimed++;
        break;
      case 'expired':
        expired++;
        break;
      case 'not_found':
        notFound++;
        break;
      case 'no_capacity':
        noCapacity++;
        break;
      default:
        other++;
    }
  }

  return {
    batchOfferId,
    attempted: recipients.length,
    wins,
    alreadyClaimed,
    expired,
    notFound,
    noCapacity,
    other,
    ok: wins === 1,
    durationMs,
  };
}
