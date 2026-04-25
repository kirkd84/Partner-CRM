/**
 * Server-side ScrapeJob runner — auth-free version of
 * runScrapeJobNow used by the in-process scheduler. The admin UI
 * still calls runScrapeJobNow (which wraps this with permission
 * checks). The scheduler skips auth because it's a system caller.
 *
 * Keep this module away from the request lifecycle: no `next/headers`,
 * no `auth()`, no `revalidatePath`. Just data in / data out.
 */

import { existsSync } from 'node:fs';
import {
  fetchGooglePlacesCandidates,
  readStateBoardCsv,
  runIngest,
  STATE_BOARD_CONFIGS,
} from '@partnerradar/integrations/ingest';

interface PrismaLike {
  scrapeJob: {
    findUnique: (args: { where: { id: string } }) => Promise<{
      id: string;
      marketId: string;
      source: string;
      name: string;
      filters: unknown;
      createdBy: string;
    } | null>;
  };
}

export interface RunResult {
  total: number;
  inserted: number;
  duplicates: number;
  errors: number;
  scrapeJobId: string;
}

/**
 * Run a scrape job by id. Caller is responsible for auth.
 *
 * Returns the ingest result. Throws if the job is misconfigured (missing
 * filters, missing CSV file on disk, missing API key, etc.) — the
 * scheduler catches these and logs them.
 */
export async function runScrapeJobById(
  prisma: PrismaLike,
  jobId: string,
  apiKeyResolver: () => string | null,
): Promise<RunResult> {
  const job = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`ScrapeJob ${jobId} not found`);

  if (job.source === 'GOOGLE_PLACES') {
    const filters = job.filters as {
      partnerType?: string;
      centerLat?: number;
      centerLng?: number;
      radiusMi?: number;
      maxResults?: number;
    } | null;
    const apiKey = apiKeyResolver();
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) not configured.');
    }
    if (!filters?.partnerType || filters.centerLat == null || filters.centerLng == null) {
      throw new Error('GOOGLE_PLACES job missing partnerType / lat / lng');
    }
    const candidates = fetchGooglePlacesCandidates({
      apiKey,
      // Casting to the typed enum — runtime values match.
      partnerType: filters.partnerType as Parameters<
        typeof fetchGooglePlacesCandidates
      >[0]['partnerType'],
      centerLat: filters.centerLat,
      centerLng: filters.centerLng,
      radiusMi: filters.radiusMi ?? 10,
      maxResults: filters.maxResults ?? 60,
    });
    const result = await runIngest({
      prisma: prisma as unknown as Parameters<typeof runIngest>[0]['prisma'],
      marketId: job.marketId,
      source: 'GOOGLE_PLACES',
      jobName: job.name,
      createdBy: job.createdBy,
      candidates,
    });
    return result;
  }

  if (job.source === 'STATE_REALTY' || job.source === 'STATE_INSURANCE') {
    const filters = job.filters as { csvPath?: string; configKey?: string } | null;
    if (!filters?.csvPath || !filters?.configKey) {
      throw new Error(`${job.source} job missing csvPath / configKey`);
    }
    const config = STATE_BOARD_CONFIGS[filters.configKey];
    if (!config) {
      throw new Error(`Unknown state-board config "${filters.configKey}"`);
    }
    if (!existsSync(filters.csvPath)) {
      throw new Error(`CSV missing at ${filters.csvPath} — re-upload via /admin/state-boards.`);
    }
    const candidates = readStateBoardCsv({ csvPath: filters.csvPath, config });
    const result = await runIngest({
      prisma: prisma as unknown as Parameters<typeof runIngest>[0]['prisma'],
      marketId: job.marketId,
      source: job.source,
      jobName: job.name,
      createdBy: job.createdBy,
      candidates,
    });
    return result;
  }

  throw new Error(`Source ${job.source} is not yet wired for the scheduled runner.`);
}
