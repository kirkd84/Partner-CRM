'use server';

/**
 * Create-partner action for the business-card scanner.
 *
 * Compared to the manual /partners/new path:
 *   - Source is BUSINESS_CARD (so reports can isolate scanner ROI)
 *   - Stage is INITIAL_CONTACT — the rep just met them and they
 *     handed over a card. This stage is wired to cadences, so any
 *     "INITIAL_CONTACT → SMS Day 1" automation triggers automatically.
 *   - We do a lightweight dedupe: name + (phone-or-email) match
 *     against existing partners in the rep's market(s). If a match
 *     is found we surface it to the rep instead of creating a dup.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import type { PartnerType, PartnerStage } from '@partnerradar/types';
import { auth } from '@/auth';
import { activeTenantId } from '@/lib/tenant/context';

export interface ScannedPartnerInput {
  marketId: string;
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
  // Optional R2 URL of the original card image. We're not building
  // R2 in this slice — leaving the field in the schema so we can wire
  // it later without another migration.
  businessCardImageUrl?: string | null;
  // If the rep clicked "Yes, this is the same partner" on the
  // duplicate dialog, they pass the existing partner's id and we
  // skip create + log a touch instead.
  mergeIntoPartnerId?: string | null;
}

export interface DuplicateCandidate {
  id: string;
  publicId: string;
  companyName: string;
  city: string | null;
  state: string | null;
  matchReason: string;
}

export interface CreateFromScanResult {
  ok: true;
  partnerId: string;
  publicId: string;
  isNew: boolean;
}

export interface DuplicatesFoundResult {
  ok: false;
  reason: 'duplicates';
  candidates: DuplicateCandidate[];
}

/**
 * Look for likely duplicates of the scanned card. Conservative —
 * only flags very strong matches so we don't bury reps in false
 * positives. Two heuristics:
 *
 *   1. Exact normalized phone digits match (digits-only, last 10).
 *   2. Same companyName (case-insensitive trimmed) within the same market.
 *
 * Returns up to 3 candidates so the rep can pick the right merge
 * target. Empty array = ship-it.
 */
async function findDuplicates(
  input: ScannedPartnerInput,
  scopeMarketIds: string[],
): Promise<DuplicateCandidate[]> {
  const candidates: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  // Phone match — last-10-digits is the durable identifier across
  // formatting differences ("(555) 123-4567" vs "555.123.4567").
  // Contact.phones is a JSON array, so we use a raw query for the
  // text search inside it. Best-effort: if the raw query fails for
  // any reason, we silently fall back to the companyName-only check.
  if (input.phone) {
    const digits = input.phone.replace(/\D/g, '').slice(-10);
    if (digits.length === 10 && scopeMarketIds.length > 0) {
      try {
        const rows = await prisma.$queryRaw<
          Array<{
            id: string;
            publicId: string;
            companyName: string;
            city: string | null;
            state: string | null;
          }>
        >`
          SELECT DISTINCT p."id", p."publicId", p."companyName", p."city", p."state"
          FROM "Partner" p
          INNER JOIN "Contact" c ON c."partnerId" = p."id"
          WHERE p."archivedAt" IS NULL
            AND p."marketId" = ANY(${scopeMarketIds})
            AND c."phones"::text LIKE ${'%' + digits + '%'}
          LIMIT 3
        `;
        for (const m of rows) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            candidates.push({ ...m, matchReason: `Phone ends in ${digits.slice(-4)}` });
          }
        }
      } catch (err) {
        console.warn('[scan-dedupe] phone match query failed; skipping', err);
      }
    }
  }

  // Name match — case-insensitive equality against companyName.
  const trimmed = input.companyName.trim();
  if (trimmed.length > 2) {
    const matches = await prisma.partner.findMany({
      where: {
        archivedAt: null,
        marketId: { in: scopeMarketIds },
        companyName: { equals: trimmed, mode: 'insensitive' },
      },
      select: { id: true, publicId: true, companyName: true, city: true, state: true },
      take: 3,
    });
    for (const m of matches) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        candidates.push({ ...m, matchReason: `Same company name` });
      }
    }
  }

  return candidates.slice(0, 3);
}

export async function createPartnerFromScan(
  input: ScannedPartnerInput,
): Promise<CreateFromScanResult | DuplicatesFoundResult> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');

  const repMarkets = session.user.markets ?? [];
  if (!repMarkets.includes(input.marketId)) {
    throw new Error('FORBIDDEN: market not in your scope');
  }

  // Merge path — rep confirmed this is the same partner. Log a card-
  // re-scan activity, optionally update missing fields from the new
  // card, and return the existing id without creating a duplicate.
  if (input.mergeIntoPartnerId) {
    const existing = await prisma.partner.findUnique({
      where: { id: input.mergeIntoPartnerId },
      select: { id: true, publicId: true, marketId: true, companyName: true },
    });
    if (!existing) throw new Error('Merge target not found');
    if (!repMarkets.includes(existing.marketId)) {
      throw new Error('FORBIDDEN: merge target market');
    }

    await prisma.activity.create({
      data: {
        partnerId: existing.id,
        userId: session.user.id,
        type: 'NOTE',
        body: `${session.user.name} re-scanned a business card for this partner.`,
      },
    });
    revalidatePath(`/partners/${existing.id}`);
    return { ok: true, partnerId: existing.id, publicId: existing.publicId, isNew: false };
  }

  // Look for dupes BEFORE creating. The UI re-submits with
  // mergeIntoPartnerId once the rep picks a match (or with no
  // mergeIntoPartnerId + a "force=true" — but we keep this slice
  // simple and just block creation when dupes exist).
  const dupes = await findDuplicates(input, repMarkets);
  if (dupes.length > 0) {
    return { ok: false, reason: 'duplicates', candidates: dupes };
  }

  // Generate the next PR-#### id (same approach as /partners/new).
  const last = await prisma.partner.findFirst({
    where: { publicId: { startsWith: 'PR-' } },
    orderBy: { publicId: 'desc' },
    select: { publicId: true },
  });
  const nextNum = last ? parseInt(last.publicId.replace('PR-', ''), 10) + 1 : 1001;
  const publicId = `PR-${nextNum}`;

  const partner = await prisma.partner.create({
    data: {
      publicId,
      companyName: input.companyName.trim(),
      partnerType: input.partnerType,
      marketId: input.marketId,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
      website: input.website ?? null,
      assignedRepId: session.user.id,
      stage: 'INITIAL_CONTACT' as PartnerStage,
      source: 'BUSINESS_CARD',
      businessCardImageUrl: input.businessCardImageUrl ?? null,
      notes:
        input.title || input.contactName
          ? [input.contactName, input.title].filter(Boolean).join(' — ')
          : null,
    },
    select: { id: true, publicId: true },
  });

  // If the card had a name + contact details, drop a Contact row so
  // future cadence merges have something to render. Contact uses a
  // single `name` field plus `phones`/`emails` as JSON arrays in the
  // shape `[{ number/address, label, primary }]` — match that shape
  // exactly or Prisma rejects the create.
  if (input.contactName || input.email || input.phone) {
    const phones = input.phone ? [{ number: input.phone, label: 'work', primary: true }] : [];
    const emails = input.email ? [{ address: input.email, label: 'work', primary: true }] : [];
    await prisma.contact.create({
      data: {
        partnerId: partner.id,
        name: (input.contactName ?? '').trim() || 'Primary contact',
        title: input.title ?? null,
        phones,
        emails,
        isPrimary: true,
      },
    });
  }

  await prisma.activity.create({
    data: {
      partnerId: partner.id,
      userId: session.user.id,
      type: 'NOTE',
      body: `${session.user.name} added this partner from a business-card scan.`,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'Partner',
      entityId: partner.id,
      action: 'CREATE',
      diff: { source: 'BUSINESS_CARD', stage: 'INITIAL_CONTACT' },
    },
  });

  revalidatePath('/partners');
  revalidatePath('/admin/scraped-leads');
  return { ok: true, partnerId: partner.id, publicId: partner.publicId, isNew: true };
}

/**
 * Surface the rep's available markets so the /scan page can render a
 * picker (rep with multiple markets needs to choose where the card
 * belongs). For single-market reps we auto-pick the one and skip.
 */
export async function listRepMarkets(): Promise<Array<{ id: string; name: string }>> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  // Tenant scope is implicit — session.user.markets is already
  // tenant-scoped at the auth layer.
  await activeTenantId(session); // touch for side-effects only
  return prisma.market.findMany({
    where: { id: { in: session.user.markets ?? [] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
