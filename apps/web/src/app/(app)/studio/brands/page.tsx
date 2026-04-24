/**
 * /studio/brands — Marketing Wizard brand list + management.
 *
 * Manager+ can view; admin can create/approve/archive/set-default.
 * One workspace typically has one ACTIVE brand + zero to many TRAINING
 * drafts or ARCHIVED history entries.
 */

import Link from 'next/link';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { BrandsClient } from './BrandsClient';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/radar');

  const isAdmin = session.user.role === 'ADMIN';
  const markets = session.user.markets ?? [];

  const workspaces = await prisma.mwWorkspace
    .findMany({
      where: isAdmin ? {} : { partnerRadarMarketId: { in: markets } },
      select: {
        id: true,
        name: true,
        market: { select: { name: true } },
        brands: {
          orderBy: [{ isDefault: 'desc' }, { status: 'asc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            name: true,
            status: true,
            isDefault: true,
            createdAt: true,
            profile: true,
            _count: { select: { trainingSamples: true, designs: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    .catch(() => []);

  const rows = workspaces.map((ws) => ({
    workspaceId: ws.id,
    workspaceName: ws.name,
    marketName: ws.market?.name ?? 'No market',
    brands: ws.brands.map((b) => {
      const profile = (b.profile ?? {}) as {
        companyName?: string;
        colors?: { primary?: { hex?: string }; secondary?: { hex?: string } };
      };
      return {
        id: b.id,
        name: b.name,
        status: b.status,
        isDefault: b.isDefault,
        createdAt: b.createdAt.toISOString(),
        companyName: profile.companyName ?? null,
        primaryHex: profile.colors?.primary?.hex ?? null,
        secondaryHex: profile.colors?.secondary?.hex ?? null,
        sampleCount: b._count.trainingSamples,
        designCount: b._count.designs,
      };
    }),
  }));

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Brands</h1>
            <p className="mt-1 text-xs text-gray-500">
              One ACTIVE brand per workspace gets used for every design. TRAINING drafts let you
              experiment before committing.
            </p>
          </div>
          {isAdmin && rows.length > 0 && (
            <Link
              href={`/studio/brand-setup?workspaceId=${rows[0].workspaceId}`}
              className="ml-auto rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              New brand
            </Link>
          )}
        </div>
      </header>

      <BrandsClient workspaces={rows} canEdit={isAdmin} />
    </div>
  );
}
