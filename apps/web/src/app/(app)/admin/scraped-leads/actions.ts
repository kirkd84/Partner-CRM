'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import type { PartnerType } from '@partnerradar/types';
import { auth } from '@/auth';

/**
 * Admin review actions for the Prospect Queue (ScrapedLead).
 *
 * Phase 4 ingestion (NMLS, state licensing boards, Overture, Google Places)
 * writes candidate leads to ScrapedLead with status PENDING. This file is
 * the human-in-the-loop: approve → create a Partner; reject → mark rejected
 * so we don't re-surface the same lead on the next scrape.
 */

async function assertManagerPlusInMarket(marketId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  if (!isManagerPlus) throw new Error('FORBIDDEN: manager+');
  if (!session.user.markets.includes(marketId)) throw new Error('FORBIDDEN: market');
  return session;
}

export async function approveLead(input: { leadId: string; assignedRepId?: string | null }) {
  const lead = await prisma.scrapedLead.findUnique({
    where: { id: input.leadId },
    select: { id: true, marketId: true, normalized: true, status: true },
  });
  if (!lead) throw new Error('NOT_FOUND');
  if (lead.status !== 'PENDING') throw new Error('Already reviewed');

  const session = await assertManagerPlusInMarket(lead.marketId);

  // Pull what we can out of the normalized payload. The NMLS / Overture
  // / state-board adapters all write a minimal shape: { companyName,
  // partnerType, address, city, state, zip, website?, primaryContact? }.
  const n = (lead.normalized ?? {}) as Record<string, any>;
  const companyName = String(n.companyName ?? '').trim();
  if (!companyName) throw new Error('Lead missing companyName — reject instead');
  const partnerType = (n.partnerType as PartnerType) ?? 'OTHER';

  // Next PR-#### — same approach as the manual New Partner path.
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
      companyName,
      partnerType,
      marketId: lead.marketId,
      address: n.address ?? null,
      city: n.city ?? null,
      state: n.state ?? null,
      zip: n.zip ?? null,
      website: n.website ?? null,
      lat: typeof n.lat === 'number' ? n.lat : null,
      lng: typeof n.lng === 'number' ? n.lng : null,
      assignedRepId: input.assignedRepId ?? null,
      stage: 'NEW_LEAD',
      source: 'SCRAPED',
      notes: n.notes ?? null,
    },
  });

  await prisma.scrapedLead.update({
    where: { id: lead.id },
    data: {
      status: 'APPROVED',
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
      approvedPartnerId: partner.id,
    },
  });

  await prisma.activity.create({
    data: {
      partnerId: partner.id,
      userId: session.user.id,
      type: 'ASSIGNMENT',
      body: `${session.user.name} approved this prospect from the scraper queue.`,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'ScrapedLead',
      entityId: lead.id,
      action: 'APPROVE',
      diff: { approvedPartnerId: partner.id, publicId },
    },
  });

  revalidatePath('/admin/scraped-leads');
  revalidatePath('/partners');
  return { ok: true, partnerId: partner.id, publicId };
}

/**
 * Bulk approve N pending leads with the same optional rep assignment.
 *
 * Runs sequentially (not Promise.all) so PR-#### IDs stay monotonic and
 * the audit log entries are ordered. Failures are caught per-lead so a
 * single 'Already reviewed' (someone approved it from another tab)
 * doesn't tank the rest of the batch.
 */
export async function bulkApproveLeads(input: {
  leadIds: string[];
  assignedRepId?: string | null;
}): Promise<{
  approved: number;
  errors: Array<{ leadId: string; error: string }>;
  partnerIds: string[];
}> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  if (!isManagerPlus) throw new Error('FORBIDDEN: manager+');

  const errors: Array<{ leadId: string; error: string }> = [];
  const partnerIds: string[] = [];
  let approved = 0;

  for (const leadId of input.leadIds) {
    try {
      const result = await approveLead({
        leadId,
        assignedRepId: input.assignedRepId ?? null,
      });
      partnerIds.push(result.partnerId);
      approved++;
    } catch (err) {
      errors.push({
        leadId,
        error: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  revalidatePath('/admin/scraped-leads');
  revalidatePath('/partners');
  return { approved, errors, partnerIds };
}

/**
 * Bulk reject N pending leads with the same reason.
 */
export async function bulkRejectLeads(input: {
  leadIds: string[];
  reason: string;
}): Promise<{ rejected: number; errors: Array<{ leadId: string; error: string }> }> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  if (!isManagerPlus) throw new Error('FORBIDDEN: manager+');

  const errors: Array<{ leadId: string; error: string }> = [];
  let rejected = 0;

  for (const leadId of input.leadIds) {
    try {
      await rejectLead({ leadId, reason: input.reason });
      rejected++;
    } catch (err) {
      errors.push({
        leadId,
        error: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  revalidatePath('/admin/scraped-leads');
  return { rejected, errors };
}

export async function rejectLead(input: { leadId: string; reason: string }) {
  const lead = await prisma.scrapedLead.findUnique({
    where: { id: input.leadId },
    select: { id: true, marketId: true, status: true },
  });
  if (!lead) throw new Error('NOT_FOUND');
  if (lead.status !== 'PENDING') throw new Error('Already reviewed');
  const session = await assertManagerPlusInMarket(lead.marketId);

  await prisma.scrapedLead.update({
    where: { id: lead.id },
    data: {
      status: 'REJECTED',
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
      rejectedReason: input.reason.trim() || 'No reason given',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'ScrapedLead',
      entityId: lead.id,
      action: 'REJECT',
      diff: { reason: input.reason.trim() || 'No reason given' },
    },
  });

  revalidatePath('/admin/scraped-leads');
  return { ok: true };
}
