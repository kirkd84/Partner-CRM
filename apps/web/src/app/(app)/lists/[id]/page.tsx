import { notFound } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { HitListDetailClient } from './HitListDetailClient';

export const dynamic = 'force-dynamic';

export default async function HitListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';

  const list = await prisma.hitList.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, avatarColor: true } },
      market: { select: { id: true, name: true, timezone: true } },
      stops: {
        orderBy: { order: 'asc' },
        include: {
          partner: {
            select: {
              id: true,
              publicId: true,
              companyName: true,
              partnerType: true,
              stage: true,
              address: true,
              city: true,
              state: true,
              zip: true,
            },
          },
        },
      },
    },
  });
  if (!list) notFound();
  if (!session.user.markets.includes(list.marketId)) notFound();
  const isOwner = list.userId === session.user.id;
  if (!isManagerPlus && !isOwner) notFound();

  // Partners available to add — same market, not already on the list.
  const alreadyOnList = new Set(list.stops.map((s) => s.partnerId));
  const availablePartners = await prisma.partner.findMany({
    where: {
      marketId: list.marketId,
      archivedAt: null,
      id: { notIn: [...alreadyOnList] },
    },
    orderBy: { companyName: 'asc' },
    select: {
      id: true,
      publicId: true,
      companyName: true,
      partnerType: true,
      stage: true,
      city: true,
      state: true,
    },
    take: 500,
  });

  return (
    <HitListDetailClient
      list={{
        id: list.id,
        date: list.date.toISOString(),
        marketName: list.market.name,
        startAddress: list.startAddress,
        startMode: list.startMode,
        userName: list.user.name,
        isOwnedByMe: isOwner,
      }}
      stops={list.stops.map((s) => ({
        id: s.id,
        order: s.order,
        plannedArrival: s.plannedArrival.toISOString(),
        plannedDurationMin: s.plannedDurationMin,
        completedAt: s.completedAt?.toISOString() ?? null,
        skippedAt: s.skippedAt?.toISOString() ?? null,
        partner: s.partner,
      }))}
      availablePartners={availablePartners}
    />
  );
}
