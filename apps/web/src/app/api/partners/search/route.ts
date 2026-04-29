/**
 * GET /api/partners/search?q=… — quick partner lookup for the
 * referral picker, networking-group member-add, and any other autocomplete
 * surface. Tenant + market scoped to the caller; returns the top 8 hits.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@partnerradar/db';
import { activeTenantId } from '@/lib/tenant/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ results: [] }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const excludeId = searchParams.get('excludeId') ?? null;
  if (q.length < 2) return NextResponse.json({ results: [] });

  // Manager+ sees the whole tenant; reps see their own markets.
  const tenantId = await activeTenantId(session);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    archivedAt: null,
    companyName: { contains: q, mode: 'insensitive' },
  };
  if (session.user.role === 'REP') {
    where.marketId = { in: session.user.markets ?? [] };
  } else if (tenantId) {
    where.market = { tenantId };
  }
  if (excludeId) where.id = { not: excludeId };

  const results = await prisma.partner
    .findMany({
      where,
      select: {
        id: true,
        publicId: true,
        companyName: true,
        city: true,
        state: true,
        partnerType: true,
      },
      orderBy: { companyName: 'asc' },
      take: 8,
    })
    .catch(() => []);

  return NextResponse.json({ results });
}
