/**
 * /scan — mobile-first business-card scanner.
 *
 * Designed for a rep at an event: open on phone → camera button →
 * snap → confirm screen → partner created at INITIAL_CONTACT, ready
 * for cadences. Desktop falls back to a normal file picker so reps
 * can also drag in scanned cards from their laptop.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Camera, Sparkles } from 'lucide-react';
import { ScanClient } from './ScanClient';
import { listRepMarkets } from './actions';

export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const markets = await listRepMarkets().catch(() => []);
  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="border-b border-card-border bg-white px-4 py-3 sm:px-6">
        <Link
          href="/generate-leads"
          className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Generate Leads
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Scan business card</h1>
        </div>
        <p className="mt-1 text-[11px] text-gray-500 sm:text-xs">
          Snap a card and Claude reads the company, contact, phone, email, and address. Review,
          edit, then save — the lead lands at <strong>Initial Contact</strong> so any cadence on
          that stage kicks in automatically.
        </p>
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 sm:px-6">
        {!aiConfigured && (
          <div className="mx-auto mb-4 flex max-w-xl items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <div>
              <div className="font-semibold">AI not configured</div>
              The scanner uses Claude Vision to read cards. Set{' '}
              <code className="rounded bg-amber-100 px-1">ANTHROPIC_API_KEY</code> on Railway and
              redeploy. The scan UI is here so you can test the flow once the key&apos;s wired.
            </div>
          </div>
        )}
        {markets.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-lg border border-card-border bg-white p-6 text-center text-sm text-gray-600">
            You aren&apos;t assigned to a market yet. Ask an admin to add you to one before scanning
            cards.
          </div>
        ) : (
          <ScanClient markets={markets} aiConfigured={aiConfigured} />
        )}
      </div>
    </div>
  );
}
