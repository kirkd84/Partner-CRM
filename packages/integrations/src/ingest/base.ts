import { dedupHash, type ProspectCandidate } from './types';

/**
 * Generic ingest runner. Accepts an async iterator of ProspectCandidate
 * objects from any adapter (NMLS CSV, Overture Maps, state board HTML
 * scrape), dedupes them against the existing ScrapedLead table, and writes
 * new rows with status=PENDING. Existing leads are left untouched so human
 * review state is preserved.
 *
 * The runner is DB-agnostic: pass in a Prisma-compatible client so this
 * module can live in packages/integrations without a hard Prisma dep.
 */
export interface IngestPrismaClient {
  scrapeJob: {
    findFirst(args: { where: { marketId: string; source: any; name: string } }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        marketId: string;
        source: any;
        name: string;
        filters: any;
        cadence: string;
        createdBy: string;
      };
    }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: { lastRunAt: Date } }): Promise<unknown>;
  };
  scrapedLead: {
    findFirst(args: { where: { dedupHash: string; marketId: string } }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        scrapeJobId: string;
        marketId: string;
        rawPayload: any;
        normalized: any;
        dedupHash: string;
        status: 'PENDING';
      };
    }): Promise<{ id: string }>;
  };
}

export interface IngestRunInput {
  prisma: IngestPrismaClient;
  marketId: string;
  source: 'NMLS' | 'STATE_REALTY' | 'STATE_INSURANCE' | 'OVERTURE' | 'CHAMBER' | 'GOOGLE_PLACES';
  jobName: string;
  createdBy: string; // user id of whoever kicked this off (or system user)
  /** Async iterator of candidates from the adapter. */
  candidates: AsyncIterable<ProspectCandidate>;
}

export interface IngestRunResult {
  scrapeJobId: string;
  total: number;
  inserted: number;
  duplicates: number;
  errors: number;
}

export async function runIngest(input: IngestRunInput): Promise<IngestRunResult> {
  // Upsert a ScrapeJob row so repeat runs share a container for the leads.
  let job = await input.prisma.scrapeJob.findFirst({
    where: { marketId: input.marketId, source: input.source, name: input.jobName },
  });
  if (!job) {
    job = await input.prisma.scrapeJob.create({
      data: {
        marketId: input.marketId,
        source: input.source,
        name: input.jobName,
        filters: {},
        cadence: 'manual', // scheduled cron wiring comes in a follow-up
        createdBy: input.createdBy,
      },
    });
  }

  const result: IngestRunResult = {
    scrapeJobId: job.id,
    total: 0,
    inserted: 0,
    duplicates: 0,
    errors: 0,
  };

  for await (const candidate of input.candidates) {
    result.total++;
    try {
      const hash = dedupHash(candidate);
      const existing = await input.prisma.scrapedLead.findFirst({
        where: { dedupHash: hash, marketId: input.marketId },
      });
      if (existing) {
        result.duplicates++;
        continue;
      }
      await input.prisma.scrapedLead.create({
        data: {
          scrapeJobId: job.id,
          marketId: input.marketId,
          rawPayload: candidate.raw ?? {},
          normalized: toNormalized(candidate),
          dedupHash: hash,
          status: 'PENDING',
        },
      });
      result.inserted++;
    } catch (err) {
      result.errors++;
      // Log and keep going — one bad row shouldn't kill a 50k-row import.
      console.error('[ingest] failed to store candidate', { err, candidate });
    }
  }

  await input.prisma.scrapeJob.update({
    where: { id: job.id },
    data: { lastRunAt: new Date() },
  });

  return result;
}

function toNormalized(c: ProspectCandidate) {
  // Trim strings, upper-case state, drop nulls.
  const obj: Record<string, unknown> = {
    companyName: c.companyName.trim(),
    partnerType: c.partnerType,
  };
  if (c.address) obj.address = c.address.trim();
  if (c.city) obj.city = c.city.trim();
  if (c.state) obj.state = c.state.trim().toUpperCase();
  if (c.zip) obj.zip = c.zip.trim();
  if (c.phone) obj.phone = c.phone.trim();
  if (c.website) obj.website = c.website.trim();
  if (typeof c.lat === 'number') obj.lat = c.lat;
  if (typeof c.lng === 'number') obj.lng = c.lng;
  if (c.primaryContact) obj.primaryContact = c.primaryContact;
  if (c.notes) obj.notes = c.notes.trim();
  if (c.sourceKey) obj.sourceKey = c.sourceKey;
  return obj;
}
