/**
 * Touchpoints cron — daily.
 *
 * Two phases per tick:
 *   1. Rescan: walk every active partner + contact and create new
 *      Touchpoint rows for upcoming birthdays / business anniversaries
 *      / partnership milestones in the next 30 days. Idempotent on
 *      Touchpoint.uniqueKey so re-running is safe.
 *   2. Send: process every SCHEDULED row whose scheduledFor is in
 *      the past. Marks each row SENT/FAILED and bumps Activity.
 *
 * Gated by CRON_SECRET so a random pinger can't hammer the send loop.
 * Set CRON_SECRET in Railway, then point Railway Cron / a third-party
 * scheduler at /api/cron/touchpoints-tick with header
 * `authorization: Bearer $CRON_SECRET`.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@partnerradar/db';
import { scanTouchpoints } from '@/lib/touchpoints/scan';
import { sendTouchpoint } from '@/lib/touchpoints/send';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // 1. Rescan every tenant. Tenants are cheap to enumerate (<100 in
  //    practice) and the scanner is per-tenant scoped.
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let scheduled = 0;
  let alreadyScheduled = 0;
  for (const t of tenants) {
    const r = await scanTouchpoints({ tenantId: t.id }).catch(() => null);
    if (r) {
      scheduled += r.scheduled;
      alreadyScheduled += r.alreadyScheduled;
    }
  }
  // Catch any tenant-less rows (legacy data) too.
  const orphan = await scanTouchpoints({ tenantId: null }).catch(() => null);
  if (orphan) {
    scheduled += orphan.scheduled;
    alreadyScheduled += orphan.alreadyScheduled;
  }

  // 2. Process due sends.
  const due = await prisma.touchpoint.findMany({
    where: {
      status: 'SCHEDULED',
      channel: { in: ['SMS', 'EMAIL'] },
      scheduledFor: { lte: new Date() },
    },
    select: { id: true },
    take: 100, // budget per tick — next tick picks up the rest
  });
  let sent = 0;
  let failed = 0;
  for (const tp of due) {
    const r = await sendTouchpoint(tp.id).catch(() => ({ outcome: 'FAILED' as const }));
    if (r.outcome === 'SENT') sent++;
    else if (r.outcome === 'FAILED') failed++;
  }

  return NextResponse.json({
    ok: true,
    scanned: { scheduled, alreadyScheduled },
    sent,
    failed,
    dueRemaining: due.length === 100 ? 'check next tick' : 0,
  });
}
