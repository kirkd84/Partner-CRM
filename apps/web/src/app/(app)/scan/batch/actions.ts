'use server';

/**
 * Batch business-card → prospect-queue ingestion.
 *
 * The single-card flow (createPartnerFromScan) creates a Partner row
 * directly. For a 3000-card BD onboarding that's not what you want —
 * you want a manager to triage in batches. This action drops scans
 * into the existing /admin/scraped-leads queue (source=BUSINESS_CARD)
 * which already has bulk approve/reject + split-rep distribution we
 * shipped a few commits ago.
 *
 * Per submission:
 *   1. Find-or-create a ScrapeJob row to group this batch's leads
 *   2. For each extracted card → create a ScrapedLead with
 *      status=PENDING and the normalized payload
 *
 * The actual Claude Vision extraction runs client-side (one image at
 * a time → POST /api/scan/extract → result stored in client state)
 * before this action gets called. Server just persists.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import type { PartnerType } from '@partnerradar/types';

export interface BatchScanCard {
  /** Free-form id assigned client-side so the UI can match results back. */
  clientKey: string;
  companyName: string;
  partnerType: PartnerType;
  contactName?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /** Confidence from the Vision extraction; rendered in the queue. */
  confidence?: number | null;
  /** Free-form notes from the model — surfaces in the queue Inspect drawer. */
  notesFromModel?: string | null;
}

export interface BatchScanInput {
  marketId: string;
  /** Optional batch label so the manager can group these by event/conference. */
  batchLabel?: string | null;
  cards: BatchScanCard[];
}

export interface BatchScanResult {
  jobId: string;
  jobName: string;
  inserted: number;
  skipped: number;
  /** clientKey → outcome */
  outcomes: Array<{
    clientKey: string;
    status: 'queued' | 'skipped';
    reason?: string;
  }>;
}

export async function batchScanToQueue(input: BatchScanInput): Promise<BatchScanResult> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const repMarkets = session.user.markets ?? [];
  if (!repMarkets.includes(input.marketId)) {
    throw new Error('FORBIDDEN: market not in your scope');
  }

  // One ScrapeJob per submission so the batch is recoverable + auditable.
  // Manager can also re-find these via /admin/scrape-jobs filtered by source.
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const label = input.batchLabel?.trim();
  const jobName = label
    ? `Card batch — ${label} — ${stamp}`
    : `Card batch — ${session.user.name ?? session.user.email} — ${stamp}`;

  // The schema's ScrapeJob unique key is name+source+marketId per the
  // ingest helper — we let the find-or-create logic in runIngest match
  // this. For the standalone path we use upsert keyed on the same
  // tuple so re-submitting a batch with the same label appends.
  const job = await prisma.scrapeJob
    .upsert({
      where: {
        // No declared compound unique on this combination, so we look up
        // by exact name first, then fall back to create.
        // Prisma's `where` requires a unique input — using `id` won't
        // match a fresh row. Switch to manual find-or-create.
        id: '__never__',
      },
      create: {
        marketId: input.marketId,
        source: 'CUSTOM_URL',
        name: jobName,
        filters: { batchLabel: label ?? null, kind: 'business-card-batch' } as object,
        cadence: 'manual',
        active: false,
        createdBy: session.user.id,
        lastRunAt: new Date(),
      },
      update: { lastRunAt: new Date() },
    })
    .catch(async () => {
      // The upsert above will always hit the create branch (id never
      // matches) but Prisma still complains in some setups about the
      // missing unique. Fall back to a manual find/create.
      const existing = await prisma.scrapeJob.findFirst({
        where: { marketId: input.marketId, name: jobName, source: 'CUSTOM_URL' },
        select: { id: true },
      });
      if (existing) {
        await prisma.scrapeJob.update({
          where: { id: existing.id },
          data: { lastRunAt: new Date() },
        });
        return { id: existing.id };
      }
      return prisma.scrapeJob.create({
        data: {
          marketId: input.marketId,
          source: 'CUSTOM_URL',
          name: jobName,
          filters: { batchLabel: label ?? null, kind: 'business-card-batch' } as object,
          cadence: 'manual',
          active: false,
          createdBy: session.user.id,
          lastRunAt: new Date(),
        },
        select: { id: true },
      });
    });

  let inserted = 0;
  let skipped = 0;
  const outcomes: BatchScanResult['outcomes'] = [];

  for (const card of input.cards) {
    if (!card.companyName?.trim()) {
      skipped++;
      outcomes.push({
        clientKey: card.clientKey,
        status: 'skipped',
        reason: 'No company name extracted — please re-take the photo.',
      });
      continue;
    }
    const normalized = {
      companyName: card.companyName.trim(),
      partnerType: card.partnerType,
      contactName: card.contactName ?? null,
      title: card.title ?? null,
      email: card.email ?? null,
      phone: card.phone ?? null,
      website: card.website ?? null,
      address: card.address ?? null,
      city: card.city ?? null,
      state: card.state ?? null,
      zip: card.zip ?? null,
      confidence: card.confidence ?? null,
      modelNotes: card.notesFromModel ?? null,
      source: 'BUSINESS_CARD_BATCH',
      submittedBy: session.user.id,
      submittedAt: new Date().toISOString(),
    };
    try {
      // sourceKey is unique-ish per card so re-submitting the same
      // batch doesn't double-insert. Use the clientKey since the rep's
      // browser already keys photos uniquely.
      await prisma.scrapedLead.create({
        data: {
          scrapeJobId: job.id,
          marketId: input.marketId,
          status: 'PENDING',
          sourceKey: `card-${card.clientKey}`,
          normalized: normalized as object,
          raw: { provider: 'claude-vision-batch' } as object,
        },
      });
      inserted++;
      outcomes.push({ clientKey: card.clientKey, status: 'queued' });
    } catch (err) {
      skipped++;
      outcomes.push({
        clientKey: card.clientKey,
        status: 'skipped',
        reason: err instanceof Error ? err.message : 'Insert failed',
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'ScrapeJob',
      entityId: job.id,
      action: 'BATCH_SCAN',
      diff: { jobName, inserted, skipped, totalSubmitted: input.cards.length },
    },
  });

  revalidatePath('/admin/scraped-leads');
  return {
    jobId: job.id,
    jobName,
    inserted,
    skipped,
    outcomes,
  };
}

/**
 * List the rep's markets so the batch upload page can show a picker.
 * Same logic as the single-scan flow.
 */
export async function listRepMarkets(): Promise<Array<{ id: string; name: string }>> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  return prisma.market.findMany({
    where: { id: { in: session.user.markets ?? [] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
