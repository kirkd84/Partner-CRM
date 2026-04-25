import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { ProspectCandidate, ProspectPartnerType } from './types';

/**
 * State licensing board ingestion — generic CSV stream adapter parameterized
 * by per-state column mappings.
 *
 * Why one generic + per-state config instead of one file per board: every
 * state's data export looks the same (license #, name, address, etc.) but
 * the column NAMES differ wildly (e.g. CO uses "LicenseeName", TX uses
 * "FullName", FL uses "LICENSEE_NAME"). Rather than 30 near-identical
 * files we ship one parser + a registry of mappings.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Where to get the CSVs (manual download — no scraping, all public records)
 * ──────────────────────────────────────────────────────────────────────
 *
 * Colorado realty (DORA): https://apps.colorado.gov/dre/data
 *   → "Real Estate Broker Licensee Data" — monthly CSV
 *
 * Colorado insurance: https://doi.colorado.gov/insurance-products/producer-search
 *   → "Producer Licensee Data" — request via FOIA / public records portal
 *
 * Texas realty (TREC): https://www.trec.texas.gov/license-holder-search
 *   → "TREC License Holder Data" — monthly CSV download (public)
 *
 * Texas insurance (TDI): https://www.tdi.texas.gov/agent/licensee-info-data.html
 *   → "Licensee Data" — quarterly Excel/CSV download
 *
 * Florida realty (DBPR): http://www.myfloridalicense.com/dbpr/sto/file_download/
 *   → "Real Estate Broker / Sales Associate Roster" — monthly CSV
 *
 * Florida insurance (DFS): https://licenseesearch.fldfs.com/
 *   → "Bulk Licensee Data Request" form, monthly CSV
 *
 * Drop downloaded CSVs at /tmp/state-boards/<state>-<board>.csv and run
 * the ingest CLI (scripts/ingest-state-boards.ts).
 *
 * Dedup: license number is unique per state, so sourceKey is
 * `<state>-<board>:<licenseNumber>`. Renewals don't change the license #
 * so re-running ingestion against a new month's file just touches dates.
 */

export type StateBoardKind = 'realty' | 'insurance';

export interface StateBoardConfig {
  /** 2-letter US state code, e.g. 'CO'. */
  state: string;
  kind: StateBoardKind;
  /**
   * Maps CSV column headers (lowercased) to the canonical fields the
   * adapter knows how to read. Headers are case-insensitive — we
   * lowercase before lookup. Multiple aliases are supported so a state
   * that ships either "License_Number" or "LicNo" can be handled.
   */
  columns: {
    licenseNumber: string[];
    name: string[];
    /** Some boards split into first/last; if so, leave `name` empty and fill these. */
    firstName?: string[];
    lastName?: string[];
    /** Brokerage / firm / agency name — used as Partner.companyName when present. */
    company?: string[];
    address?: string[];
    city?: string[];
    state?: string[];
    zip?: string[];
    phone?: string[];
    email?: string[];
    /** License type — used to filter out inactive / surrendered / etc. */
    licenseType?: string[];
    status?: string[];
    expiration?: string[];
  };
  /**
   * Status values that mean "active and prospectable". Anything outside
   * this list gets skipped. Lowercased before comparison.
   */
  activeStatuses?: string[];
  /**
   * License-type filter. Lowercased substring match — e.g. ['broker',
   * 'sales associate'] for realty. Pass null to keep everything.
   */
  licenseTypeKeep?: string[] | null;
}

export interface StateBoardCsvOptions {
  csvPath: string;
  config: StateBoardConfig;
  /** Cap for smoke tests. 0 / undefined = no limit. */
  limit?: number;
}

/**
 * Stream a state-board CSV and emit one ProspectCandidate per active row.
 * Skips inactive licenses, blank rows, and rows missing a license number.
 */
export async function* readStateBoardCsv(
  opts: StateBoardCsvOptions,
): AsyncIterable<ProspectCandidate> {
  const { config } = opts;
  const partnerType: ProspectPartnerType = config.kind === 'realty' ? 'REALTOR' : 'INSURANCE_AGENT';
  const sourcePrefix = `${config.state.toLowerCase()}-${config.kind}`;

  const rl = createInterface({
    input: createReadStream(opts.csvPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let headers: string[] | null = null;
  let count = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const fields = splitCsvLine(line);
    if (!headers) {
      headers = fields.map((h) => h.trim().toLowerCase());
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (fields[i] ?? '').trim();
    });

    const licenseNumber = pick(row, config.columns.licenseNumber);
    if (!licenseNumber) continue;

    // Filter by status (e.g. only "Active" / "Current") if configured.
    if (config.activeStatuses && config.columns.status) {
      const status = pick(row, config.columns.status).toLowerCase();
      if (status && !config.activeStatuses.some((s) => status.includes(s.toLowerCase()))) {
        continue;
      }
    }

    // Filter by license type (e.g. only "Broker" / "Sales Associate").
    if (config.licenseTypeKeep && config.columns.licenseType) {
      const lic = pick(row, config.columns.licenseType).toLowerCase();
      if (lic && !config.licenseTypeKeep.some((k) => lic.includes(k.toLowerCase()))) {
        continue;
      }
    }

    // Build a display name. Boards that publish individual licensees often
    // split into first/last; brokerage rows typically use a single Name field.
    let displayName = pick(row, config.columns.name);
    if (!displayName && (config.columns.firstName || config.columns.lastName)) {
      const first = pick(row, config.columns.firstName ?? []);
      const last = pick(row, config.columns.lastName ?? []);
      displayName = [first, last].filter(Boolean).join(' ').trim();
    }
    if (!displayName) continue;

    const company = pick(row, config.columns.company ?? []);
    // Use the brokerage/agency as the company when present so duplicates
    // across associates of the same firm collapse via the
    // (companyName, state, zip) fallback hash. The associate's name
    // becomes the primary contact.
    const companyName = company || displayName;
    const isAssociate = Boolean(company) && company !== displayName;

    yield {
      companyName,
      partnerType,
      address: pick(row, config.columns.address ?? []) || null,
      city: pick(row, config.columns.city ?? []) || null,
      state: (pick(row, config.columns.state ?? []) || config.state).toUpperCase().slice(0, 2),
      zip: pick(row, config.columns.zip ?? []) || null,
      phone: pick(row, config.columns.phone ?? []) || null,
      website: null,
      primaryContact: isAssociate
        ? {
            name: displayName,
            email: pick(row, config.columns.email ?? []) || undefined,
            phone: pick(row, config.columns.phone ?? []) || undefined,
            title: 'Licensed Associate',
          }
        : null,
      // sourceKey makes dedup deterministic across monthly re-imports.
      sourceKey: `${sourcePrefix}:${licenseNumber}`,
      notes: buildNotes({
        licenseNumber,
        licenseType: pick(row, config.columns.licenseType ?? []),
        expiration: pick(row, config.columns.expiration ?? []),
      }),
      raw: row,
    };

    count++;
    if (opts.limit && count >= opts.limit) break;
  }
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k.toLowerCase()];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

function buildNotes(info: {
  licenseNumber: string;
  licenseType?: string;
  expiration?: string;
}): string | null {
  const parts: string[] = [];
  if (info.licenseNumber) parts.push(`License #${info.licenseNumber}`);
  if (info.licenseType) parts.push(`Type: ${info.licenseType}`);
  if (info.expiration) parts.push(`Expires: ${info.expiration}`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Same minimal CSV parser as nmls.ts — handles quoted fields with embedded
 * commas + escaped double-quotes, no multi-line quoted fields. State boards
 * generally produce well-formed exports; if a board ships multi-line cells
 * we'll switch to csv-parse here.
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

// ─── Built-in state board configs ─────────────────────────────────────
//
// Column names verified against publicly-available headers as of
// 2026-04. If a board updates its export schema, just amend the column
// arrays below — the parser is column-name driven.

export const CO_REALTY: StateBoardConfig = {
  state: 'CO',
  kind: 'realty',
  columns: {
    licenseNumber: ['license_number', 'licensenumber', 'lic_no'],
    name: ['licensee_name', 'licenseename', 'name'],
    firstName: ['first_name', 'firstname'],
    lastName: ['last_name', 'lastname'],
    company: ['firm_name', 'firmname', 'employer', 'company'],
    address: ['address', 'mailing_address', 'street'],
    city: ['city'],
    state: ['state'],
    zip: ['zip', 'zip_code', 'zipcode'],
    phone: ['phone', 'phone_number'],
    email: ['email', 'email_address'],
    licenseType: ['license_type', 'licensetype'],
    status: ['license_status', 'status'],
    expiration: ['expiration_date', 'expiration', 'expires'],
  },
  activeStatuses: ['active', 'current'],
  licenseTypeKeep: ['broker', 'sales agent', 'sales associate', 'salesperson'],
};

export const CO_INSURANCE: StateBoardConfig = {
  state: 'CO',
  kind: 'insurance',
  columns: {
    licenseNumber: ['license_number', 'licensenumber', 'producer_number', 'npn'],
    name: ['licensee_name', 'producer_name', 'name'],
    firstName: ['first_name'],
    lastName: ['last_name'],
    company: ['business_entity_name', 'agency_name', 'firm_name', 'company'],
    address: ['business_address', 'mailing_address', 'address'],
    city: ['city'],
    state: ['state'],
    zip: ['zip_code', 'zip'],
    phone: ['phone'],
    email: ['email_address', 'email'],
    licenseType: ['license_type', 'line_of_authority'],
    status: ['license_status', 'status'],
    expiration: ['expiration_date', 'expires'],
  },
  activeStatuses: ['active', 'current'],
  licenseTypeKeep: ['property', 'casualty', 'p&c', 'homeowners'],
};

export const TX_REALTY: StateBoardConfig = {
  state: 'TX',
  kind: 'realty',
  columns: {
    licenseNumber: ['license_number', 'licensenumber', 'lic_no'],
    name: ['full_name', 'name'],
    firstName: ['first_name'],
    lastName: ['last_name'],
    company: ['broker_name', 'sponsoring_broker', 'firm_name'],
    address: ['mailing_street1', 'address', 'street_address'],
    city: ['mailing_city', 'city'],
    state: ['mailing_state', 'state'],
    zip: ['mailing_zip', 'zip'],
    phone: ['phone', 'phone_number'],
    email: ['email', 'email_address'],
    licenseType: ['license_type', 'license'],
    status: ['license_status', 'status'],
    expiration: ['expiration_date', 'expires'],
  },
  activeStatuses: ['active', 'current'],
  licenseTypeKeep: ['broker', 'sales agent', 'salesperson', 'sales associate'],
};

export const TX_INSURANCE: StateBoardConfig = {
  state: 'TX',
  kind: 'insurance',
  columns: {
    licenseNumber: ['license_number', 'agent_id', 'npn'],
    name: ['agent_name', 'name', 'full_name'],
    firstName: ['first_name'],
    lastName: ['last_name'],
    company: ['agency_name', 'firm_name', 'business_name'],
    address: ['mailing_address', 'address', 'business_address'],
    city: ['city'],
    state: ['state'],
    zip: ['zip', 'zip_code'],
    phone: ['phone'],
    email: ['email', 'email_address'],
    licenseType: ['license_type', 'authority', 'line_of_authority'],
    status: ['license_status', 'status'],
    expiration: ['expiration_date', 'expires'],
  },
  activeStatuses: ['active', 'current'],
  licenseTypeKeep: ['property', 'casualty', 'p&c', 'general lines'],
};

export const FL_REALTY: StateBoardConfig = {
  state: 'FL',
  kind: 'realty',
  columns: {
    licenseNumber: ['license_number', 'licensee_id', 'lic_no'],
    name: ['licensee_name', 'name'],
    firstName: ['first_name'],
    lastName: ['last_name'],
    company: ['employer_name', 'broker_name', 'firm'],
    address: ['mailing_address', 'address'],
    city: ['city', 'mailing_city'],
    state: ['state', 'mailing_state'],
    zip: ['zip', 'mailing_zip'],
    phone: ['phone'],
    email: ['email_address', 'email'],
    licenseType: ['license_type'],
    status: ['license_status', 'status'],
    expiration: ['expiration_date', 'expires'],
  },
  activeStatuses: ['active', 'current'],
  licenseTypeKeep: ['broker', 'sales associate', 'salesperson'],
};

export const FL_INSURANCE: StateBoardConfig = {
  state: 'FL',
  kind: 'insurance',
  columns: {
    licenseNumber: ['license_number', 'agent_id', 'npn'],
    name: ['licensee_name', 'agent_name', 'name'],
    firstName: ['first_name'],
    lastName: ['last_name'],
    company: ['agency_name', 'business_name'],
    address: ['mailing_address', 'address', 'business_address'],
    city: ['city'],
    state: ['state'],
    zip: ['zip', 'zip_code'],
    phone: ['phone'],
    email: ['email', 'email_address'],
    licenseType: ['license_type', 'line_of_authority'],
    status: ['license_status', 'status'],
    expiration: ['expiration_date', 'expires'],
  },
  activeStatuses: ['active', 'current', 'currently licensed'],
  licenseTypeKeep: ['general lines', 'property', 'casualty', '2-20', '0-55', '20-44'],
};

/**
 * Index of built-in configs by `<state>-<board>` for the CLI / admin UI to
 * enumerate without having to know each export name.
 */
export const STATE_BOARD_CONFIGS: Record<string, StateBoardConfig> = {
  'co-realty': CO_REALTY,
  'co-insurance': CO_INSURANCE,
  'tx-realty': TX_REALTY,
  'tx-insurance': TX_INSURANCE,
  'fl-realty': FL_REALTY,
  'fl-insurance': FL_INSURANCE,
};
