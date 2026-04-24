'use server';

/**
 * Admin actions for the Partner Reliability report.
 *
 * Only admins can bulk-flip autoWaitlistEligible. Managers can read
 * the report but not mutate rows — the reasoning is market-scope
 * boundaries get fuzzy when a bulk flip could escape them; easier to
 * gate on admin for now and loosen later if needed.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';

export async function bulkSetAutoWaitlist(args: {
  partnerIds: string[];
  eligible: boolean;
}): Promise<{ ok: boolean; updated: number }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return { ok: false, updated: 0 };
  }
  if (args.partnerIds.length === 0) return { ok: true, updated: 0 };
  const res = await prisma.partner.updateMany({
    where: { id: { in: args.partnerIds } },
    data: { autoWaitlistEligible: args.eligible },
  });
  revalidatePath('/admin/reliability');
  return { ok: true, updated: res.count };
}
