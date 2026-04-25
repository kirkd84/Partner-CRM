'use server';

/**
 * Phase 8: ScrapeJob CRUD + ad-hoc Run Now.
 *
 * Jobs are per-market. Cadence is currently informational (Inngest cron
 * wiring is a follow-up); "Run now" kicks the runner immediately and
 * inserts ScrapedLeads into the existing /admin/scraped-leads queue.
 *
 * Permissions: admin sees every market; manager+ scoped to their markets.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import {
  fetchGooglePlacesCandidates,
  readStateBoardCsv,
  runIngest,
  STATE_BOARD_CONFIGS,
} from '@partnerradar/integrations/ingest';
import { placesApiKey } from '@/lib/places/key';
import { existsSync } from 'node:fs';

type Source =
  | 'GOOGLE_PLACES'
  | 'NMLS'
  | 'STATE_REALTY'
  | 'STATE_INSURANCE'
  | 'OVERTURE'
  | 'CHAMBER';
type PartnerType =
  | 'REALTOR'
  | 'BROKER'
  | 'MORTGAGE_BROKER'
  | 'LOAN_OFFICER'
  | 'INSURANCE_AGENT'
  | 'PROPERTY_MANAGER'
  | 'CLAIMS_ADJUSTER'
  | 'ATTORNEY'
  | 'CONTRACTOR'
  | 'ROOFER'
  | 'OTHER';

export interface CreateScrapeJobInput {
  marketId: string;
  source: Source;
  name: string;
  cadence: string; // cron expr or 'manual'
  /** GOOGLE_PLACES filters: { partnerType, centerLat, centerLng, radiusMi, maxResults } */
  filters: {
    partnerType?: PartnerType;
    centerLat?: number;
    centerLng?: number;
    radiusMi?: number;
    maxResults?: number;
  };
}

async function assertManagerInMarket(marketId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    throw new Error('FORBIDDEN');
  }
  if (session.user.role === 'MANAGER') {
    const markets = session.user.markets ?? [];
    if (!markets.includes(marketId)) throw new Error('FORBIDDEN');
  }
  return session;
}

export async function createScrapeJob(input: CreateScrapeJobInput): Promise<{ id: string }> {
  const session = await assertManagerInMarket(input.marketId);
  if (!input.name.trim()) throw new Error('Give the job a name');
  if (input.source === 'GOOGLE_PLACES') {
    if (!input.filters.partnerType) throw new Error('Partner type is required for Google Places');
    if (input.filters.centerLat == null || input.filters.centerLng == null) {
      throw new Error('Center coordinates are required for Google Places');
    }
    if (!input.filters.radiusMi || input.filters.radiusMi <= 0) {
      throw new Error('Radius must be positive');
    }
  }
  const created = await prisma.scrapeJob.create({
    data: {
      marketId: input.marketId,
      source: input.source,
      name: input.name.trim(),
      cadence: input.cadence.trim() || 'manual',
      filters: input.filters as unknown as Prisma.InputJsonValue,
      createdBy: session.user.id,
    },
    select: { id: true },
  });
  revalidatePath('/admin/scrape-jobs');
  return created;
}

/**
 * Flip an existing job's cadence — used to promote a 'manual' job to
 * 'daily' or 'weekly' once Kirk wants the in-process scheduler to keep
 * it warm. Accepted values: 'manual', 'hourly', 'daily', 'weekly',
 * 'every Nm/h/d'. See parseCadenceMs in lib/scrape/scheduler.ts.
 */
export async function updateScrapeJobCadence(jobId: string, cadence: string): Promise<void> {
  const job = await prisma.scrapeJob.findUnique({
    where: { id: jobId },
    select: { marketId: true },
  });
  if (!job) throw new Error('NOT_FOUND');
  await assertManagerInMarket(job.marketId);
  const next = cadence.trim().toLowerCase() || 'manual';
  await prisma.scrapeJob.update({ where: { id: jobId }, data: { cadence: next } });
  revalidatePath('/admin/scrape-jobs');
}

export async function setScrapeJobActive(jobId: string, active: boolean): Promise<void> {
  const job = await prisma.scrapeJob.findUnique({
    where: { id: jobId },
    select: { marketId: true },
  });
  if (!job) throw new Error('NOT_FOUND');
  await assertManagerInMarket(job.marketId);
  await prisma.scrapeJob.update({ where: { id: jobId }, data: { active } });
  revalidatePath('/admin/scrape-jobs');
}

export async function deleteScrapeJob(jobId: string): Promise<void> {
  const job = await prisma.scrapeJob.findUnique({
    where: { id: jobId },
    select: { marketId: true },
  });
  if (!job) throw new Error('NOT_FOUND');
  await assertManagerInMarket(job.marketId);
  await prisma.scrapeJob.delete({ where: { id: jobId } });
  revalidatePath('/admin/scrape-jobs');
}

/**
 * Run Now: hydrate the candidate iterator for the job's source and feed
 * it through `runIngest`, which dedupes against existing ScrapedLeads
 * and writes new rows with status=PENDING.
 */
export async function runScrapeJobNow(jobId: string): Promise<{
  ok: true;
  total: number;
  inserted: number;
  duplicates: number;
  errors: number;
}> {
  const job = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('NOT_FOUND');
  const session = await assertManagerInMarket(job.marketId);

  if (job.source === 'GOOGLE_PLACES') {
    const filters = job.filters as {
      partnerType?: PartnerType;
      centerLat?: number;
      centerLng?: number;
      radiusMi?: number;
      maxResults?: number;
    } | null;
    const apiKey = placesApiKey();
    if (!apiKey) throw new Error('Set GOOGLE_PLACES_API_KEY (or reuse GOOGLE_MAPS_API_KEY).');
    if (!filters?.partnerType || filters.centerLat == null || filters.centerLng == null) {
      throw new Error('Job is missing partnerType / lat / lng — edit the job first.');
    }
    const candidates = fetchGooglePlacesCandidates({
      apiKey,
      partnerType: filters.partnerType,
      centerLat: filters.centerLat,
      centerLng: filters.centerLng,
      radiusMi: filters.radiusMi ?? 10,
      maxResults: filters.maxResults ?? 60,
    });
    const result = await runIngest({
      // Cast: Prisma's enum value names match the literals we declare.
      prisma: prisma as unknown as Parameters<typeof runIngest>[0]['prisma'],
      marketId: job.marketId,
      source: 'GOOGLE_PLACES',
      jobName: job.name,
      createdBy: session.user.id,
      candidates,
    });
    revalidatePath('/admin/scrape-jobs');
    revalidatePath('/admin/scraped-leads');
    return { ok: true, ...result };
  }

  if (job.source === 'STATE_REALTY' || job.source === 'STATE_INSURANCE') {
    // Filters carry { csvPath, configKey } — see /admin/state-boards UI.
    const filters = job.filters as { csvPath?: string; configKey?: string } | null;
    if (!filters?.csvPath || !filters?.configKey) {
      throw new Error(
        'State-board job is missing csvPath / configKey. Use /admin/state-boards to set up imports.',
      );
    }
    const config = STATE_BOARD_CONFIGS[filters.configKey];
    if (!config) {
      throw new Error(
        `Unknown state-board config "${filters.configKey}". Known: ${Object.keys(STATE_BOARD_CONFIGS).join(', ')}`,
      );
    }
    if (!existsSync(filters.csvPath)) {
      throw new Error(`CSV not found at ${filters.csvPath}. Drop the file there and try again.`);
    }
    const candidates = readStateBoardCsv({ csvPath: filters.csvPath, config });
    const result = await runIngest({
      prisma: prisma as unknown as Parameters<typeof runIngest>[0]['prisma'],
      marketId: job.marketId,
      source: job.source,
      jobName: job.name,
      createdBy: session.user.id,
      candidates,
    });
    revalidatePath('/admin/scrape-jobs');
    revalidatePath('/admin/scraped-leads');
    return { ok: true, ...result };
  }

  // Other sources route through dedicated importers. Surface a clear
  // error rather than silently doing nothing.
  throw new Error(
    `Run-now is not yet wired for ${job.source}. Use /admin/state-boards for state realty/insurance, or the NMLS CLI for mortgage data.`,
  );
}
