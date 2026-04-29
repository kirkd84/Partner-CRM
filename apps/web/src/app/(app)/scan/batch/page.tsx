/**
 * /scan/batch — bulk business-card upload for big BD onboardings.
 * Drop a folder of card photos, watch them queue through Claude Vision,
 * push the results to the prospect queue at /admin/scraped-leads where
 * the existing bulk-approve / split-by-rep tooling takes over.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Layers, Sparkles } from 'lucide-react';
import { listRepMarkets } from './actions';
import { BatchScanClient } from './BatchScanClient';

export const dynamic = 'force-dynamic';

export default async function BatchScanPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const markets = await listRepMarkets().catch(() => []);
  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="border-b border-card-border bg-white px-4 py-3 sm:px-6">
        <Link
          href="/scan"
          className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Back to single scan
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Batch card upload</h1>
        </div>
        <p className="mt-1 text-[11px] text-gray-500 sm:text-xs">
          Drop a stack of card photos. Each one runs through Claude Vision; results land in the{' '}
          <Link href="/admin/scraped-leads" className="font-medium text-primary hover:underline">
            prospect queue
          </Link>{' '}
          for review. Use the bulk approve + split-rep controls there to route them all in one pass.
        </p>
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 sm:px-6">
        {!aiConfigured && (
          <div className="mx-auto mb-4 flex max-w-3xl items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <div>
              <div className="font-semibold">AI not configured</div>
              The batch scanner uses Claude Vision. Set{' '}
              <code className="rounded bg-amber-100 px-1">ANTHROPIC_API_KEY</code> on Railway and
              redeploy.
            </div>
          </div>
        )}
        {markets.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-lg border border-card-border bg-white p-6 text-center text-sm text-gray-600">
            You aren&apos;t assigned to a market yet. Ask an admin to add you to one before
            uploading cards.
          </div>
        ) : (
          <BatchScanClient markets={markets} aiConfigured={aiConfigured} />
        )}
      </div>
    </div>
  );
}
