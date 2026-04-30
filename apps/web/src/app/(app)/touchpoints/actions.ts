'use server';

/**
 * Touchpoints server actions — manual triggers + edits for
 * birthdays / business anniversaries / partnership milestones.
 *
 * Most rows get created by the scanner (lib/touchpoints/scan.ts) at
 * cron-tick frequency. The manager workflow on /touchpoints is just:
 *   1. Browse upcoming
 *   2. Customize the message + channel if the default is wrong
 *   3. Click "Send now" or let the cron handle it
 *   4. Skip / cancel anything that doesn't apply (recently lost partners)
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { activeTenantId } from '@/lib/tenant/context';
import { scanTouchpoints } from '@/lib/touchpoints/scan';
import { sendTouchpoint, previewTouchpoint, type TouchpointPreview } from '@/lib/touchpoints/send';

async function assertManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const ok =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!ok) throw new Error('FORBIDDEN: manager+');
  return session;
}

export async function rescanTouchpoints(): Promise<{
  scheduled: number;
  alreadyScheduled: number;
}> {
  const session = await assertManagerPlus();
  const tenantId = await activeTenantId(session);
  const result = await scanTouchpoints({ tenantId });
  revalidatePath('/touchpoints');
  return { scheduled: result.scheduled, alreadyScheduled: result.alreadyScheduled };
}

export async function updateTouchpoint(
  id: string,
  patch: {
    channel?: 'SMS' | 'EMAIL' | 'MANUAL';
    message?: string | null;
    scheduledFor?: string | null;
  },
): Promise<{ ok: true }> {
  const session = await assertManagerPlus();
  const existing = await prisma.touchpoint.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw new Error('NOT_FOUND');
  if (existing.status !== 'SCHEDULED') throw new Error('Only scheduled touchpoints can be edited');
  await prisma.touchpoint.update({
    where: { id },
    data: {
      ...(patch.channel !== undefined && { channel: patch.channel }),
      ...(patch.message !== undefined && { message: patch.message?.trim() || null }),
      ...(patch.scheduledFor !== undefined && {
        scheduledFor: patch.scheduledFor ? new Date(patch.scheduledFor) : new Date(),
      }),
      createdBy: session.user.id,
    },
  });
  revalidatePath('/touchpoints');
  return { ok: true };
}

export async function cancelTouchpoint(id: string): Promise<{ ok: true }> {
  await assertManagerPlus();
  await prisma.touchpoint.update({
    where: { id },
    data: { status: 'CANCELED' },
  });
  revalidatePath('/touchpoints');
  return { ok: true };
}

export async function sendTouchpointNow(id: string): Promise<{
  outcome: 'SENT' | 'FAILED' | 'SKIPPED';
  detail?: string;
}> {
  await assertManagerPlus();
  const r = await sendTouchpoint(id);
  revalidatePath('/touchpoints');
  return { outcome: r.outcome, detail: r.detail };
}

/**
 * Render the touchpoint preview (subject + body + channel + recipient
 * + blockers) so the row UI can show a confirm panel before firing.
 */
export async function getTouchpointPreview(id: string): Promise<TouchpointPreview | null> {
  await assertManagerPlus();
  return previewTouchpoint(id);
}

/**
 * Manual "send all due" trigger — fires every SCHEDULED touchpoint in
 * the active tenant whose channel is SMS/EMAIL and whose scheduledFor
 * is in the past. Useful before cron is wired, or as a safety valve
 * when the manager wants to flush the queue right now. Capped at 50
 * sends per click so a runaway scanner doesn't spam.
 */
export async function sendAllDueTouchpoints(): Promise<{
  sent: number;
  failed: number;
  total: number;
}> {
  const session = await assertManagerPlus();
  const { activeTenantId: getTenant } = await import('@/lib/tenant/context');
  const tenantId = await getTenant(session);
  const due = await prisma.touchpoint.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: 'SCHEDULED',
      channel: { in: ['SMS', 'EMAIL'] },
      scheduledFor: { lte: new Date() },
    },
    select: { id: true },
    take: 50,
  });
  let sent = 0;
  let failed = 0;
  for (const tp of due) {
    const r = await sendTouchpoint(tp.id).catch(() => ({ outcome: 'FAILED' as const }));
    if (r.outcome === 'SENT') sent++;
    else if (r.outcome === 'FAILED') failed++;
  }
  revalidatePath('/touchpoints');
  return { sent, failed, total: due.length };
}
