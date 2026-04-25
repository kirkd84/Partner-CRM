/**
 * In-process ScrapeJob scheduler.
 *
 * Started from instrumentation.ts on server boot. Polls every
 * SCRAPE_POLL_MINUTES (default 5) for jobs that:
 *   - are active
 *   - have a parseable cadence (currently 'daily', 'weekly', '@hourly',
 *     '@daily', '@weekly', or 'every Nm/h/d')
 *   - have a lastRunAt older than the cadence interval (or null = never run)
 *
 * Runs each due job sequentially via runScrapeJobById and stamps lastRunAt.
 *
 * Disabled when:
 *   - SKIP_SCRAPE_SCHEDULER=1
 *   - INNGEST_EVENT_KEY is set (yields to Inngest cron)
 *   - DATABASE_URL is missing
 *
 * Multi-dyno safety: this is a single-dyno design. If Kirk ever scales
 * Railway to >1 instance, two dynos will both try to run a job at the
 * same time — that's mostly harmless (runIngest dedups by hash) but
 * wastes API credits. Switch to Inngest before scaling out.
 */

const DEFAULT_POLL_MINUTES = 5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface SchedulerDeps {
  prisma: {
    scrapeJob: {
      findMany: (args: {
        where: { active: boolean };
        select: { id: true; cadence: true; lastRunAt: true; name: true; source: true };
      }) => Promise<
        Array<{
          id: string;
          cadence: string;
          lastRunAt: Date | null;
          name: string;
          source: string;
        }>
      >;
      update: (args: { where: { id: string }; data: { lastRunAt: Date } }) => Promise<unknown>;
    };
  };
  runJob: (jobId: string) => Promise<{
    inserted: number;
    duplicates: number;
    errors: number;
    total: number;
  }>;
  /** ms between polls. */
  pollIntervalMs: number;
  /** Override the clock for tests. */
  now?: () => Date;
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function startScrapeScheduler(deps: SchedulerDeps) {
  if (started) return;
  started = true;

  // First sweep delayed by one interval so we don't pile work onto the
  // boot sequence (auto-migrate already runs synchronously).
  timer = setInterval(() => {
    void tick(deps).catch((err) => {
      console.error('[scrape-scheduler] tick failed:', err);
    });
  }, deps.pollIntervalMs);

  // Make sure Node doesn't exit just because the only thing keeping the
  // event loop alive is this timer (matters in test runs / dev).
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as { unref: () => void }).unref();
  }

  console.log(
    `[scrape-scheduler] Started; polling every ${Math.round(deps.pollIntervalMs / 60_000)}m.`,
  );
}

export function stopScrapeScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
}

export async function tick(deps: SchedulerDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const jobs = await deps.prisma.scrapeJob.findMany({
    where: { active: true },
    select: { id: true, cadence: true, lastRunAt: true, name: true, source: true },
  });

  for (const job of jobs) {
    const intervalMs = parseCadenceMs(job.cadence);
    if (intervalMs == null) continue; // 'manual' or unparseable → never auto-run
    const dueAt = job.lastRunAt ? new Date(job.lastRunAt.getTime() + intervalMs) : new Date(0); // never run → due immediately
    if (now < dueAt) continue;

    try {
      const result = await deps.runJob(job.id);
      await deps.prisma.scrapeJob.update({
        where: { id: job.id },
        data: { lastRunAt: now },
      });
      console.log(
        `[scrape-scheduler] Ran "${job.name}" (${job.source}): ` +
          `+${result.inserted} new / ${result.total} fetched / ${result.duplicates} dup` +
          (result.errors ? ` / ${result.errors} errors` : ''),
      );
    } catch (err) {
      // Stamp lastRunAt anyway so a permanently-broken job doesn't pin
      // us in a hot retry loop. The admin UI surfaces the error via the
      // empty inserted count next to the job row.
      await deps.prisma.scrapeJob
        .update({ where: { id: job.id }, data: { lastRunAt: now } })
        .catch(() => {});
      console.warn(
        `[scrape-scheduler] Job "${job.name}" failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Parse a cadence string into a polling interval in ms. Returns null
 * for cadences that should never auto-run (e.g. 'manual', '').
 *
 * Accepted forms (lower-cased, trimmed):
 *   - manual / off / null / ''       → null (no auto-run)
 *   - hourly  / @hourly              → 1h
 *   - daily   / @daily               → 24h
 *   - weekly  / @weekly              → 7d
 *   - every Nm  / every N min(s)     → N * 60_000
 *   - every Nh  / every N hour(s)    → N * HOUR_MS
 *   - every Nd  / every N day(s)     → N * DAY_MS
 *
 * Cron expressions ('0 6 * * *') are NOT supported here — Inngest
 * handles those when its key is wired. We treat them as 'daily' so
 * something runs in the meantime.
 */
export function parseCadenceMs(cadence: string | null | undefined): number | null {
  if (!cadence) return null;
  const c = cadence.trim().toLowerCase();
  if (!c || c === 'manual' || c === 'off' || c === 'never') return null;
  if (c === 'hourly' || c === '@hourly') return HOUR_MS;
  if (c === 'daily' || c === '@daily') return DAY_MS;
  if (c === 'weekly' || c === '@weekly') return 7 * DAY_MS;

  const match = c.match(/^every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hour|hours|d|day|days)$/);
  if (match) {
    const n = Math.max(1, parseInt(match[1]!, 10));
    const unit = match[2]!;
    if (unit.startsWith('m')) return n * 60_000;
    if (unit.startsWith('h')) return n * HOUR_MS;
    if (unit.startsWith('d')) return n * DAY_MS;
  }

  // Bare cron expressions — best-effort: treat as daily so it runs at
  // least once a day until Inngest takes over. Most prospect-ingestion
  // crons would be '0 N * * *' (once per day) anyway.
  if (/^\d|\*/.test(c)) return DAY_MS;

  return null;
}

export function pollIntervalMsFromEnv(): number {
  const raw = process.env.SCRAPE_POLL_MINUTES;
  if (!raw) return DEFAULT_POLL_MINUTES * 60_000;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_POLL_MINUTES * 60_000;
  return n * 60_000;
}
