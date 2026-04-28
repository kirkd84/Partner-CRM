/**
 * /admin/import-partners — bring an existing partner book into a market.
 *
 * Mirrors the state-board import UX but writes directly to Partner
 * (not ScrapedLead) because the book Kirk's bringing in is presumed
 * already-vetted. Reps can start working it the moment the import
 * finishes.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { Pill } from '@partnerradar/ui';
import { Upload } from 'lucide-react';
import { ImportPartnersClient } from './ImportPartnersClient';

export const dynamic = 'force-dynamic';

export default async function ImportPartnersPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') redirect('/radar');

  const userMarkets = session.user.markets ?? [];
  const markets = await prisma.market.findMany({
    where: session.user.role === 'ADMIN' ? {} : { id: { in: userMarkets } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="border-b border-card-border bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Import partners</h1>
          <Pill color="emerald" tone="soft">
            Bring your book
          </Pill>
        </div>
        <p className="mt-1 text-[11px] text-gray-500 sm:text-xs">
          Drop a CSV from your old CRM, a spreadsheet, or a Storm Cloud export. We dedupe by
          (market, company name) and skip rows already in the system. Goes straight to the Partner
          table — no review step.
        </p>
      </header>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto w-full max-w-3xl">
          <ImportPartnersClient markets={markets.map((m) => ({ id: m.id, name: m.name }))} />
        </div>
      </div>
    </div>
  );
}
