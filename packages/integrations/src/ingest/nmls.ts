import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { ProspectCandidate } from './types';

/**
 * NMLS Consumer Access ingestion adapter.
 *
 * NMLS publishes quarterly CSV dumps of every registered mortgage company
 * and loan originator — covers 100% of the mortgage-broker ICP and requires
 * no ToS gymnastics. Download instructions:
 *
 *   1. Register at https://www.nmlsconsumeraccess.org/ (free).
 *   2. Request the "Monthly Download Files" — `company.csv` and `individual.csv`.
 *   3. Drop them at /tmp/nmls/company.csv and /tmp/nmls/individual.csv
 *      (or wherever you run the ingestion from).
 *   4. Run the ingest CLI — see scripts/ingest-nmls.ts.
 *
 * This adapter is stream-based so a 500MB file doesn't blow memory. It emits
 * one ProspectCandidate per CSV row; the base runner dedupes by NMLS ID.
 *
 * CSV schema (NMLS "Company File", public download):
 *   Company_ID, Company_Name, Company_DBA, Full_Address, City, State, Zip,
 *   Phone, Website, Primary_Federal_Regulator, Company_Charter_Type, ...
 *
 * We only keep mortgage-broker and mortgage-lender charter types; other
 * charters (credit unions, banks) belong to their own adapters.
 */
export interface NmlsCsvOptions {
  /** Path to the NMLS "Company File" CSV. */
  companyCsvPath: string;
  /** Filter candidates to a single state (2-letter code); pass null for all. */
  stateFilter?: string | null;
  /** Optional: limit for smoke-testing; 0 or undefined = no limit. */
  limit?: number;
}

export async function* readNmlsCompaniesCsv(
  opts: NmlsCsvOptions,
): AsyncIterable<ProspectCandidate> {
  const rl = createInterface({
    input: createReadStream(opts.companyCsvPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let headers: string[] | null = null;
  let count = 0;

  for await (const line of rl) {
    const fields = splitCsvLine(line);
    if (!headers) {
      headers = fields.map((h) => h.trim().toLowerCase());
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = fields[i] ?? '';
    });

    const companyId = row['company_id']?.trim();
    const companyName = row['company_name']?.trim();
    if (!companyId || !companyName) continue;

    const state = row['state']?.trim().toUpperCase() || null;
    if (opts.stateFilter && state !== opts.stateFilter.toUpperCase()) continue;

    const charter = (row['company_charter_type'] ?? '').toLowerCase();
    if (charter && !charter.includes('mortgage')) {
      // Skip banks, credit unions, etc. — outside our mortgage-broker ICP.
      continue;
    }

    yield {
      companyName,
      partnerType: 'MORTGAGE_BROKER',
      address: row['full_address']?.trim() || null,
      city: row['city']?.trim() || null,
      state,
      zip: row['zip']?.trim() || null,
      phone: row['phone']?.trim() || null,
      website: row['website']?.trim() || null,
      sourceKey: `nmls:${companyId}`,
      notes: row['company_dba']?.trim() ? `DBA: ${row['company_dba'].trim()}` : null,
      raw: row,
    };

    count++;
    if (opts.limit && count >= opts.limit) break;
  }
}

/**
 * Minimal CSV splitter that handles quoted fields with embedded commas and
 * escaped double-quotes (""). Not a full RFC 4180 parser — if NMLS ever ships
 * multi-line quoted fields we'll swap to csv-parse.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === ',') {
        out.push(cur);
        cur = '';
      } else if (c === '"') {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}
