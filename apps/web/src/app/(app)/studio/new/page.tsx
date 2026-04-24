/**
 * /studio/new — full-screen mobile-first "create a design" surface.
 *
 * Pattern: pick a content-type, type what you want, hit Generate.
 * When the server action returns, we redirect to the new design's
 * detail page.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { NewDesignForm } from './NewDesignForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function NewDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; contentType?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/radar');
  const sp = await searchParams;

  const markets = session.user.markets ?? [];
  const workspaces = await prisma.mwWorkspace.findMany({
    where: session.user.role === 'ADMIN' ? {} : { partnerRadarMarketId: { in: markets } },
    orderBy: { createdAt: 'asc' },
    include: {
      brands: {
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  const workspace = sp.workspaceId
    ? (workspaces.find((w) => w.id === sp.workspaceId) ?? workspaces[0])
    : workspaces[0];

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-gray-900">No workspace yet</h1>
          <p className="mt-2 text-sm text-gray-600">
            Studio creates a workspace per market on first server boot. Refresh in a minute.
          </p>
          <Link href="/studio" className="mt-4 inline-block text-sm text-primary">
            Back to Studio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-card-border bg-white px-4 py-3 sm:px-6">
        <Link
          href="/studio"
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-sm font-semibold text-gray-900 sm:text-base">New design</h1>
        <span className="ml-auto truncate text-[11px] text-gray-500 sm:text-xs">
          {workspace.name}
          {workspace.brands[0] ? ` · ${workspace.brands[0].name}` : ' · no active brand'}
        </span>
      </header>

      <div className="flex-1">
        <NewDesignForm
          workspaceId={workspace.id}
          hasActiveBrand={workspace.brands.length > 0}
          initialContentType={
            (sp.contentType as 'FLYER' | 'SOCIAL_POST' | 'BUSINESS_CARD' | undefined) ?? 'FLYER'
          }
        />
      </div>
    </div>
  );
}
