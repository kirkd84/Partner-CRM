'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import type { PartnerType } from '@partnerradar/types';
import { auth } from '@/auth';

/**
 * Creates a new partner in the user's market.
 * SPEC §5: any user with access to the market can add, REP-owned by creator.
 * Generates the next PR-#### publicId.
 */
export async function createPartner(input: {
  companyName: string;
  partnerType: PartnerType;
  marketId: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  website?: string;
  notes?: string;
  assignedRepId?: string; // managers may assign to someone else
}) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  if (!session.user.markets.includes(input.marketId)) throw new Error('FORBIDDEN: market');
  if (!input.companyName.trim()) throw new Error('Company name required');

  // REPs can only self-assign; managers+ can assign to anyone or leave unassigned.
  const assignedRepId = isManagerPlus ? (input.assignedRepId ?? null) : session.user.id;

  // Next PR-#### id — cheap approach: take max existing + 1.
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
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      zip: input.zip?.trim() || null,
      website: input.website?.trim() || null,
      notes: input.notes?.trim() || null,
      assignedRepId,
      stage: 'NEW_LEAD',
      source: 'MANUAL',
    },
  });

  await prisma.activity.create({
    data: {
      partnerId: partner.id,
      userId: session.user.id,
      type: 'ASSIGNMENT',
      body: `${session.user.name} added this partner.`,
    },
  });

  revalidatePath('/partners');
  revalidatePath('/radar');
  redirect(`/partners/${partner.id}`);
}
