/**
 * POST /api/cron/scrape-tick
 *
 * External cron trigger for the scrape scheduler. Replaces the
 * in-process boot-time scheduler that we tried to wire into
 * instrumentation.ts but had to back out of (edge-runtime build can't
 * bundle the node: APIs in @partnerradar/integrations).
 *
 * How it's meant to be used:
 *   - Railway → Settings → Cron Schedules → POST every 5 minutes
 *   - or any external cron (cron-job.org, GitHub Actions on schedule)
 *   - or `curl -X POST -H "x-cron-secret: $SECRET" ...` from Kirk's box
 *
 * Auth: requires `x-cron-secret: <CRON_SECRET>` header. CRON_SECRET is
 * a random string Kirk sets as an env var; if it's not set we 503 so a
 * forgotten endpoint can't be hammered by a stranger.
 *
 * Rate-limit: re-entrancy is gated by a module-level lock so a too-fast
 * cron doesn't run two ticks concurrently and double-charge Google
 * Places quota.
 */

import { NextRequest } from 'next/server';
import { prisma } from '@partnerradar/db';
import { tick, parseCadenceMs } from '@/lib/scrape/scheduler';
import { runScrapeJobById } from '@/lib/scrape/runner';
import { placesApiKey } from '@/lib/places/key';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let inFlight = false;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: 'CRON_SECRET not configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
  const provided = req.headers.get('x-cron-secret');
  if (provided !== secret) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (inFlight) {
    return new Response(JSON.stringify({ ok: true, skipped: 'tick already in flight' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  inFlight = true;
  const startedAt = Date.now();
  try {
    await tick({
      prisma: prisma as Parameters<typeof tick>[0]['prisma'],
      runJob: (jobId) =>
        runScrapeJobById(prisma as Parameters<typeof runScrapeJobById>[0], jobId, placesApiKey),
      // pollIntervalMs is unused inside tick() — only matters for
      // setInterval. Pass a sentinel so the type checks.
      pollIntervalMs: 0,
    });
    return new Response(JSON.stringify({ ok: true, ms: Date.now() - startedAt }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : 'tick failed',
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  } finally {
    inFlight = false;
  }
}

/**
 * GET — diagnostics. Lists active jobs + when each is next due. No
 * auth gate beyond CRON_SECRET because the response leaks job names
 * which reps see anyway in /admin/scrape-jobs.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('x-cron-secret');
  if (!secret || provided !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const jobs = await prisma.scrapeJob.findMany({
    where: { active: true },
    select: { id: true, name: true, source: true, cadence: true, lastRunAt: true },
    orderBy: { name: 'asc' },
  });
  const now = new Date();
  const status = jobs.map((j) => {
    const intervalMs = parseCadenceMs(j.cadence);
    const dueAt =
      intervalMs == null
        ? null
        : j.lastRunAt
          ? new Date(j.lastRunAt.getTime() + intervalMs).toISOString()
          : 'now';
    return {
      id: j.id,
      name: j.name,
      source: j.source,
      cadence: j.cadence,
      lastRunAt: j.lastRunAt?.toISOString() ?? null,
      nextDueAt: dueAt,
      due:
        intervalMs != null &&
        (j.lastRunAt == null || now >= new Date(j.lastRunAt.getTime() + intervalMs)),
    };
  });
  return new Response(JSON.stringify({ ok: true, now: now.toISOString(), jobs: status }, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
