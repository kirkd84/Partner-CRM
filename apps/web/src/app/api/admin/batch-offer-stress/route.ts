/**
 * POST /api/admin/batch-offer-stress
 *
 * Runs the concurrent-claim stress test against a given batch offer.
 * ADMIN only. Returns the outcome distribution — one winner should
 * always equal one; anything else is a red alert.
 *
 * This route is explicitly a diagnostic tool and MUST NOT run in a
 * production path. It's here so Kirk can push a button in the admin
 * UI and verify the EV-6 race handling stays correct as we iterate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { runConcurrentClaimStress } from '@/lib/events/cascade.test-utils';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { batchOfferId?: string } | null;
  if (!body?.batchOfferId) {
    return NextResponse.json({ error: 'missing batchOfferId' }, { status: 400 });
  }
  try {
    const result = await runConcurrentClaimStress(body.batchOfferId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[batch-offer-stress]', err);
    return NextResponse.json({ error: 'stress_failed' }, { status: 500 });
  }
}
