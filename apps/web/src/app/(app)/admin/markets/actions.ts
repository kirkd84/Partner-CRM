'use server';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';

interface MarketInput {
  name: string;
  timezone: string;
  centerLat: number;
  centerLng: number;
  scrapeRadius: number;
  physicalAddress?: string;
}

async function assertIsManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN')
    throw new Error('FORBIDDEN: manager+ required');
  return session;
}

export async function createMarket(input: MarketInput) {
  const session = await assertIsManagerPlus();
  if (!input.name.trim()) throw new Error('Name required');

  const market = await prisma.market.create({
    data: {
      name: input.name.trim(),
      timezone: input.timezone || 'America/Denver',
      defaultCenter: {
        lat: input.centerLat,
        lng: input.centerLng,
      } as Prisma.InputJsonValue,
      scrapeRadius: input.scrapeRadius,
      physicalAddress: input.physicalAddress?.trim() || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'market',
      entityId: market.id,
      action: 'create',
      diff: {
        name: market.name,
        timezone: market.timezone,
        defaultCenter: market.defaultCenter,
        scrapeRadius: market.scrapeRadius,
      } as Prisma.InputJsonValue,
    },
  });

  revalidatePath('/admin/markets');
  return market;
}

export async function updateMarket(id: string, input: MarketInput) {
  const session = await assertIsManagerPlus();
  if (!input.name.trim()) throw new Error('Name required');

  const prev = await prisma.market.findUnique({ where: { id } });
  if (!prev) throw new Error('NOT_FOUND');

  await prisma.$transaction([
    prisma.market.update({
      where: { id },
      data: {
        name: input.name.trim(),
        timezone: input.timezone || 'America/Denver',
        defaultCenter: {
          lat: input.centerLat,
          lng: input.centerLng,
        } as Prisma.InputJsonValue,
        scrapeRadius: input.scrapeRadius,
        physicalAddress: input.physicalAddress?.trim() || null,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'market',
        entityId: id,
        action: 'update',
        diff: {
          before: {
            name: prev.name,
            timezone: prev.timezone,
            defaultCenter: prev.defaultCenter,
            scrapeRadius: prev.scrapeRadius,
          },
          after: {
            name: input.name,
            timezone: input.timezone,
            defaultCenter: { lat: input.centerLat, lng: input.centerLng },
            scrapeRadius: input.scrapeRadius,
          },
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/markets');
}

/**
 * Deletes a market — refused if partners or users are still attached.
 * Safer than a cascading delete.
 */
export async function deleteMarket(id: string) {
  const session = await assertIsManagerPlus();
  const [partnerCount, userLinkCount] = await Promise.all([
    prisma.partner.count({ where: { marketId: id } }),
    prisma.userMarket.count({ where: { marketId: id } }),
  ]);
  if (partnerCount > 0 || userLinkCount > 0) {
    throw new Error(
      `Market has ${partnerCount} partner${partnerCount === 1 ? '' : 's'} and ${userLinkCount} user assignment${userLinkCount === 1 ? '' : 's'} — reassign before deleting.`,
    );
  }
  await prisma.$transaction([
    prisma.market.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'market',
        entityId: id,
        action: 'delete',
        diff: {} as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/markets');
}
