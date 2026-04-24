'use server';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { stormClient } from '@partnerradar/integrations';
import { syncOnePartnerRevenue } from '@/lib/jobs/storm-revenue-sync';

/** Admin-only wrapper around the Storm client's testConnection call. */
export async function testStormConnection(): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    throw new Error('Admin only');
  }
  return stormClient().testConnection();
}

/**
 * Manual "Sync revenue now" — kicks off a sync for every activated
 * partner synchronously. Admins call this instead of waiting for the
 * 6-hour cron during setup, demos, or debugging.
 */
export async function syncAllStormRevenueNow(): Promise<{
  ok: boolean;
  partnerCount: number;
  totalRows: number;
  totalNew: number;
  failures: number;
  firstError?: string;
}> {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    throw new Error('Admin only');
  }

  const partners = await prisma.partner.findMany({
    where: { stormCloudId: { not: null } },
    select: { id: true },
  });

  let totalRows = 0;
  let totalNew = 0;
  let failures = 0;
  let firstError: string | undefined;

  for (const p of partners) {
    const r = await syncOnePartnerRevenue(p.id);
    if (!r.ok) {
      failures++;
      if (!firstError && r.error) firstError = r.error;
      continue;
    }
    totalRows += r.synced;
    totalNew += r.newRows;
  }

  revalidatePath('/admin/integrations');
  revalidatePath('/radar');

  return {
    ok: failures === 0,
    partnerCount: partners.length,
    totalRows,
    totalNew,
    failures,
    firstError,
  };
}
