/**
 * /studio/brand-setup — admin-only new-brand form.
 *
 * This is the compact single-page version of the 4-step wizard called
 * for in SPEC_MARKETING §3.1. It ships today so the data model + extract
 * pipeline are exercised end-to-end; the full wizard (drag-drop sample
 * upload, extracted-color extraction, sample-design review) lands in
 * a dedicated MW-2 polish pass once ANTHROPIC_API_KEY + R2 are wired.
 */

import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { BrandSetupForm } from './BrandSetupForm';

export const dynamic = 'force-dynamic';

export default async function BrandSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') redirect('/studio');
  const sp = await searchParams;
  const workspaceId = sp.workspaceId;
  if (!workspaceId) notFound();

  const workspace = await prisma.mwWorkspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      partnerRadarMarketId: true,
      market: { select: { name: true } },
    },
  });
  if (!workspace) notFound();
  if (session.user.role !== 'ADMIN') {
    const markets = session.user.markets ?? [];
    if (!workspace.partnerRadarMarketId || !markets.includes(workspace.partnerRadarMarketId)) {
      redirect('/studio/brands');
    }
  }

  // Seed defaults from the tenant config so Kirk doesn't retype his
  // brand info every time.
  const defaults = {
    name: `${workspace.name} Brand`,
    companyName: 'Roof Technologies',
    primaryHex: '#F2903A',
    secondaryHex: '#1e2537',
    accentHex: '#2DBDDC',
    phone: '',
    email: '',
    website: '',
    physicalAddress: '',
    industry: 'Roofing',
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">New brand</h1>
        <p className="mt-1 text-xs text-gray-500">
          Workspace: <strong>{workspace.name}</strong>
          {workspace.market?.name ? ` · ${workspace.market.name}` : ''}
        </p>
      </header>
      <div className="flex-1 overflow-auto bg-canvas p-6">
        <BrandSetupForm workspaceId={workspace.id} defaults={defaults} />
      </div>
    </div>
  );
}
