#!/usr/bin/env tsx
/**
 * Ingest NMLS Consumer Access company CSV → ScrapedLead rows.
 *
 * Usage:
 *   DATABASE_URL=... pnpm tsx scripts/ingest-nmls.ts \
 *     --csv /path/to/nmls/company.csv \
 *     --market <marketId> \
 *     [--state CO] [--limit 500]
 *
 * Can be run manually after downloading the NMLS quarterly dump, or wired
 * into a cron (Railway cron job / GitHub Actions) once it's stable.
 *
 * The ScrapeJob name defaults to "NMLS Companies (<state>)" so repeat runs
 * share a container and dedupe naturally via base.ts.
 */
import { readNmlsCompaniesCsv, runIngest } from '../packages/integrations/src/ingest';
import { prisma } from '../packages/db/src/index';

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val && !val.startsWith('--')) {
      out[key] = val;
      i++;
    } else {
      out[key] = 'true';
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const csvPath = args.csv ?? args.c;
  const marketId = args.market ?? args.m;
  const stateFilter = args.state ?? null;
  const limit = args.limit ? parseInt(args.limit, 10) : undefined;
  const createdBy = args['created-by'] ?? 'system';

  if (!csvPath || !marketId) {
    console.error(
      'usage: pnpm tsx scripts/ingest-nmls.ts --csv <path> --market <marketId> [--state CO] [--limit N]',
    );
    process.exit(2);
  }

  const market = await prisma.market.findUnique({ where: { id: marketId } });
  if (!market) {
    console.error(`unknown marketId: ${marketId}`);
    process.exit(2);
  }

  const jobName = stateFilter ? `NMLS Companies (${stateFilter.toUpperCase()})` : 'NMLS Companies';

  console.log(`[nmls] ingesting ${csvPath} → market ${market.name} (${marketId})`);
  const start = Date.now();
  const result = await runIngest({
    prisma: prisma as any, // narrow type match — base.ts only uses two tables
    marketId,
    source: 'NMLS',
    jobName,
    createdBy,
    candidates: readNmlsCompaniesCsv({
      companyCsvPath: csvPath,
      stateFilter,
      limit,
    }),
  });
  const ms = Date.now() - start;

  console.log(`[nmls] done in ${ms}ms`, result);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
