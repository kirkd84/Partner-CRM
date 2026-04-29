/**
 * GET /api/cron/newsletter-tick — fires any newsletter rows where
 * status=SCHEDULED and scheduledAt <= now. Designed to run every
 * 5 minutes from Railway cron / an external pinger.
 *
 * Auth: requires CRON_SECRET in env. Without it, the endpoint 401s
 * so a stranger can't burn through your Resend quota.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@partnerradar/db';
import { executeNewsletterSend } from '@/app/(app)/newsletters/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Env not set yet → endpoint is a no-op, not a security hole.
    return NextResponse.json({ ok: true, skipped: 'no-cron-secret' });
  }
  const auth = req.headers.get('authorization') ?? '';
  const fromQuery = new URL(req.url).searchParams.get('secret') ?? '';
  if (auth !== `Bearer ${expected}` && fromQuery !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.newsletter.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: now },
    },
    select: { id: true },
    orderBy: { scheduledAt: 'asc' },
    take: 5,
  });

  const results: Array<{ id: string; sent?: number; error?: string }> = [];
  for (const row of due) {
    try {
      const r = await executeNewsletterSend(row.id);
      results.push({ id: row.id, sent: r.sentCount });
    } catch (err) {
      results.push({ id: row.id, error: err instanceof Error ? err.message : 'send failed' });
    }
  }

  return NextResponse.json({ ok: true, fired: results.length, results });
}
