/**
 * GET /api/health
 *
 * Liveness + readiness probe. Returns 200 if:
 *   - the process is up (trivially true if this code is running)
 *   - the database responds to SELECT 1 within 5s
 *
 * Returns 503 if Postgres is unreachable. Railway healthchecks and any
 * external uptime monitor (Better Uptime, Cronitor) poll this every
 * minute and page Kirk if it flips red.
 *
 * No auth — uptime monitors don't carry sessions and the response
 * leaks nothing sensitive (no row counts, no env values).
 */

import { prisma } from '@partnerradar/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bootedAt = new Date();

export async function GET() {
  const checks = {
    process: 'ok' as 'ok' | 'fail',
    database: 'unknown' as 'ok' | 'fail' | 'unknown',
    databaseLatencyMs: null as number | null,
    error: null as string | null,
  };

  if (process.env.DATABASE_URL) {
    const t0 = Date.now();
    try {
      // $queryRawUnsafe('SELECT 1') is the cheapest possible round-trip.
      // 5s race so a wedged DB connection doesn't hold the healthcheck
      // open indefinitely (Railway will treat that as fail anyway, but
      // we want a clean response shape).
      await Promise.race([
        prisma.$queryRawUnsafe('SELECT 1'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('db check timeout')), 5_000)),
      ]);
      checks.database = 'ok';
      checks.databaseLatencyMs = Date.now() - t0;
    } catch (err) {
      checks.database = 'fail';
      checks.databaseLatencyMs = Date.now() - t0;
      checks.error = err instanceof Error ? err.message : 'unknown db error';
    }
  } else {
    // No DATABASE_URL = misconfigured deploy. Paint red so a fresh
    // env-var screwup is loud, not silent.
    checks.database = 'fail';
    checks.error = 'DATABASE_URL not set';
  }

  const ok = checks.process === 'ok' && checks.database === 'ok';
  const body = {
    ok,
    service: 'partnerradar-web',
    status: ok ? 'ok' : 'degraded',
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    bootedAt: bootedAt.toISOString(),
    uptime: humanizeUptime(Date.now() - bootedAt.getTime()),
    timestamp: new Date().toISOString(),
    checks,
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: ok ? 200 : 503,
    headers: {
      'content-type': 'application/json',
      // Never cache — staleness defeats the purpose of a healthcheck.
      'cache-control': 'no-store',
    },
  });
}

function humanizeUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
