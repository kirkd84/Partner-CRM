'use server';

/**
 * State board CSV import — server actions.
 *
 * Flow: admin uploads a CSV (multipart) → we save it under
 * `/tmp/state-boards/<configKey>-<timestamp>.csv` so the path is stable
 * and outlives the request, create (or upsert) a ScrapeJob row pointing
 * at it, then optionally kick off `runScrapeJobNow` to ingest immediately.
 *
 * Why /tmp: Railway containers have writable /tmp; persistent disks
 * aren't worth the cost for ingestion artifacts that we re-use only on
 * "Run again". The file sticks around for the life of the dyno (long
 * enough to re-run on demand) and Railway garbage-collects on redeploy.
 *
 * Permissions: manager+ in the target market.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { STATE_BOARD_CONFIGS } from '@partnerradar/integrations/ingest';
import { runScrapeJobNow } from '../scrape-jobs/actions';

const UPLOAD_DIR = '/tmp/state-boards';
const MAX_BYTES = 100 * 1024 * 1024; // 100MB — biggest known board export is ~40MB

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

export interface StateBoardUploadInput {
  marketId: string;
  configKey: keyof typeof STATE_BOARD_CONFIGS | string;
  /** Base64-encoded CSV file contents — easier than wrestling FormData
   *  through Next 15 server actions for non-trivial files. */
  csvBase64: string;
  /** Original filename (for the job display name + upload audit). */
  filename: string;
  /** If true, immediately run the import after creating the job row. */
  runImmediately?: boolean;
}

export interface StateBoardUploadResult {
  jobId: string;
  source: 'STATE_REALTY' | 'STATE_INSURANCE';
  csvPath: string;
  ran: boolean;
  total?: number;
  inserted?: number;
  duplicates?: number;
  errors?: number;
}

/**
 * Accept a CSV upload, persist it to /tmp, create / re-use a ScrapeJob
 * for (market, source, name), and optionally trigger the ingest run.
 */
export async function uploadStateBoardCsv(
  input: StateBoardUploadInput,
): Promise<StateBoardUploadResult> {
  const session = await assertManagerInMarket(input.marketId);
  const config = STATE_BOARD_CONFIGS[input.configKey];
  if (!config) {
    throw new Error(
      `Unknown state-board config "${input.configKey}". Known: ${Object.keys(
        STATE_BOARD_CONFIGS,
      ).join(', ')}`,
    );
  }

  // Decode + size-check before touching disk so a malicious payload
  // can't fill the dyno.
  const buf = Buffer.from(input.csvBase64, 'base64');
  if (buf.length === 0) throw new Error('Uploaded file is empty.');
  if (buf.length > MAX_BYTES) {
    throw new Error(`File too large (${(buf.length / 1024 / 1024).toFixed(1)}MB > 100MB limit).`);
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = input.filename.replace(/[^a-z0-9._-]/gi, '_').slice(0, 80);
  const csvPath = join(UPLOAD_DIR, `${input.configKey}-${stamp}-${safeName}`);
  await writeFile(csvPath, buf);

  const source: 'STATE_REALTY' | 'STATE_INSURANCE' =
    config.kind === 'realty' ? 'STATE_REALTY' : 'STATE_INSURANCE';
  const jobName = `${config.state} ${config.kind === 'realty' ? 'Realty Board' : 'Insurance Board'} import`;

  // findOrCreate keeps a stable job container per (market, source, name)
  // so re-uploads accumulate under the same row in /admin/scrape-jobs.
  let job = await prisma.scrapeJob.findFirst({
    where: { marketId: input.marketId, source, name: jobName },
    select: { id: true },
  });
  if (!job) {
    job = await prisma.scrapeJob.create({
      data: {
        marketId: input.marketId,
        source,
        name: jobName,
        cadence: 'manual',
        filters: {
          configKey: input.configKey,
          csvPath,
          uploadedFilename: input.filename,
          uploadedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
        createdBy: session.user.id,
      },
      select: { id: true },
    });
  } else {
    // Update filters so "Run now" picks up the latest CSV.
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        filters: {
          configKey: input.configKey,
          csvPath,
          uploadedFilename: input.filename,
          uploadedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const result: StateBoardUploadResult = {
    jobId: job.id,
    source,
    csvPath,
    ran: false,
  };

  if (input.runImmediately) {
    const run = await runScrapeJobNow(job.id);
    result.ran = true;
    result.total = run.total;
    result.inserted = run.inserted;
    result.duplicates = run.duplicates;
    result.errors = run.errors;
  }

  revalidatePath('/admin/state-boards');
  revalidatePath('/admin/scrape-jobs');
  revalidatePath('/admin/scraped-leads');
  return result;
}
