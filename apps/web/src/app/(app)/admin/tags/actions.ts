'use server';

/**
 * Tag taxonomy admin actions.
 *
 * Tags are free-form strings stored as PartnerTag(partnerId, tag).
 * This admin surface lets the manager:
 *   - Rename a tag in bulk (cascades onto every partner using it).
 *   - Merge two tags (rename + dedupe by partnerId).
 *   - Delete a tag everywhere it appears.
 *
 * Tenant scope: managers can only operate on tags that appear on at
 * least one partner inside their tenant. The query joins through
 * Partner → Market → tenantId.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { activeTenantId } from '@/lib/tenant/context';

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

/**
 * Rename a tag everywhere it appears in the active tenant. If the
 * destination already exists on a partner who also has the source,
 * the source is dropped (the unique constraint would block otherwise).
 */
export async function renameTag(from: string, to: string): Promise<{ updated: number }> {
  const session = await assertManagerPlus();
  const tenantId = await activeTenantId(session);
  const cleanFrom = from.trim();
  const cleanTo = to.trim().slice(0, 64);
  if (!cleanFrom || !cleanTo) throw new Error('Both from + to required');
  if (cleanFrom === cleanTo) return { updated: 0 };

  const partnerScope = tenantId ? { partner: { market: { tenantId } } } : {};

  // Pull every PartnerTag row in scope. We do the dedupe in app code
  // because Prisma's bulk-update can't conditionally drop conflicting
  // rows in one statement.
  const sourceRows = await prisma.partnerTag.findMany({
    where: { tag: cleanFrom, ...partnerScope },
    select: { id: true, partnerId: true },
  });
  if (sourceRows.length === 0) return { updated: 0 };

  const partnerIds = sourceRows.map((r) => r.partnerId);
  const conflictingDest = await prisma.partnerTag.findMany({
    where: { tag: cleanTo, partnerId: { in: partnerIds } },
    select: { partnerId: true },
  });
  const haveDest = new Set(conflictingDest.map((r) => r.partnerId));

  let updated = 0;
  for (const row of sourceRows) {
    if (haveDest.has(row.partnerId)) {
      // Partner already has the dest tag; drop the source row.
      await prisma.partnerTag.delete({ where: { id: row.id } });
    } else {
      await prisma.partnerTag.update({
        where: { id: row.id },
        data: { tag: cleanTo },
      });
      updated++;
    }
  }
  revalidatePath('/admin/tags');
  return { updated };
}

/**
 * Delete a tag everywhere in the active tenant. Cannot be undone.
 */
export async function deleteTagEverywhere(tag: string): Promise<{ deleted: number }> {
  const session = await assertManagerPlus();
  const tenantId = await activeTenantId(session);
  const clean = tag.trim();
  if (!clean) throw new Error('Tag required');

  const partnerScope = tenantId ? { partner: { market: { tenantId } } } : {};

  const result = await prisma.partnerTag.deleteMany({
    where: { tag: clean, ...partnerScope },
  });
  revalidatePath('/admin/tags');
  return { deleted: result.count };
}
