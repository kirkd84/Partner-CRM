import { createHash } from 'node:crypto';

/**
 * ProspectCandidate is the normalized shape every ingestion adapter produces.
 * The admin review UI reads this out of `ScrapedLead.normalized`; the approve
 * flow uses these fields to create a Partner.
 *
 * Adapters should do their own parsing + minimal cleanup, then emit objects
 * matching this shape. The base runner handles dedupe + DB writes.
 */
export interface ProspectCandidate {
  companyName: string;
  partnerType: ProspectPartnerType;
  address?: string | null;
  city?: string | null;
  state?: string | null; // 2-letter
  zip?: string | null;
  phone?: string | null;
  website?: string | null;
  lat?: number | null;
  lng?: number | null;
  primaryContact?: { name?: string; email?: string; phone?: string; title?: string } | null;
  notes?: string | null;
  /** Source-specific identifier — e.g. NMLS ID, Overture place ID. Used in dedupe. */
  sourceKey?: string | null;
  /** Raw row from the source, captured verbatim for debugging. */
  raw?: unknown;
}

/**
 * Keep in sync with PartnerType in packages/db/prisma/schema.prisma.
 * We don't import the Prisma enum here because packages/integrations
 * is meant to be buildable without @prisma/client generated.
 */
export type ProspectPartnerType =
  | 'REALTOR'
  | 'BROKER'
  | 'MORTGAGE_BROKER'
  | 'LOAN_OFFICER'
  | 'INSURANCE_AGENT'
  | 'PROPERTY_MANAGER'
  | 'HOA'
  | 'CONTRACTOR'
  | 'HVAC'
  | 'PLUMBING'
  | 'LANDSCAPING'
  | 'RESTORATION'
  | 'ATTORNEY'
  | 'INSPECTOR'
  | 'OTHER';

/**
 * Stable dedupe hash. Two candidates with the same sourceKey (when set) or the
 * same normalized (name, state, zip) are treated as the same lead.
 *
 * Rationale: NMLS IDs are authoritative for mortgage leads; state board IDs
 * for realtor leads; Overture place IDs for everything else. When none is
 * available we fall back to a lowercased name + state + zip hash.
 */
export function dedupHash(c: ProspectCandidate): string {
  const primary = (c.sourceKey ?? '').trim().toLowerCase();
  if (primary) return hash(`key:${primary}`);
  const name = c.companyName.trim().toLowerCase().replace(/\s+/g, ' ');
  const state = (c.state ?? '').trim().toLowerCase();
  const zip = (c.zip ?? '').trim().toLowerCase();
  return hash(`nz:${name}|${state}|${zip}`);
}

function hash(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}
