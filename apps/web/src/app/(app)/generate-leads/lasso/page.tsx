/**
 * /generate-leads/lasso — dedicated lasso-then-scrape Google Places.
 *
 * Splits off from the main /map view (which now only handles "select
 * existing partners → save as Hit List"). This page exists purely to
 * draw a polygon and pull new businesses into the prospect queue.
 *
 * Permissions: manager+. The underlying server action enforces it too,
 * but we gate the page so reps don't land on a useless screen.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Card, EmptyState, Pill } from '@partnerradar/ui';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { LassoBuilder } from './LassoBuilder';

export const dynamic = 'force-dynamic';

export default async function LassoGeneratePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    // Reps can't run scrapes — they can still draw a Hit List on /map.
    redirect('/generate-leads');
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
  const keyConfigured = apiKey.length > 0;

  // Pick the user's first market as the lasso target. Multi-market
  // managers can change this in the page below; we just need a default
  // for the centerpoint.
  const markets = await prisma.market.findMany({
    where: { id: { in: session.user.markets ?? [] } },
    select: { id: true, name: true, defaultCenter: true },
    orderBy: { name: 'asc' },
  });

  const firstMarket = markets[0] ?? null;
  const defaultCenter =
    (firstMarket?.defaultCenter as { lat?: number; lng?: number } | null)?.lat != null
      ? (firstMarket!.defaultCenter as { lat: number; lng: number })
      : { lat: 39.7661, lng: -105.0772 }; // Wheat Ridge, CO fallback

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white px-4 py-3 sm:px-6">
        <Link
          href="/generate-leads"
          className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Generate Leads
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Lasso a territory</h1>
          {firstMarket && (
            <Pill tone="soft" color="blue">
              {firstMarket.name}
            </Pill>
          )}
        </div>
        <p className="mt-1 text-[11px] text-gray-500 sm:text-xs">
          Draw a polygon, pick which partner types to search, and we&apos;ll scan Google Places for
          businesses inside the shape. Results land in the{' '}
          <Link href="/admin/scraped-leads" className="font-medium text-primary hover:underline">
            prospect queue
          </Link>{' '}
          for review.
        </p>
      </header>

      <div className="min-h-0 flex-1">
        {!keyConfigured ? (
          <div className="p-6">
            <Card>
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <div className="text-sm">
                  <div className="font-semibold text-gray-900">Google Maps key not configured</div>
                  <p className="mt-1 text-gray-600">
                    Set <code>GOOGLE_MAPS_API_KEY</code> on Railway and redeploy. The lasso drawing
                    surface needs the Maps JS API; the scrape itself uses the Places API
                    server-side.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        ) : !firstMarket ? (
          <div className="p-6">
            <EmptyState
              title="No market available"
              description="You need to be assigned at least one market before you can run a territory lasso scrape. Ask your admin to add you to a market."
            />
          </div>
        ) : (
          <LassoBuilder
            apiKey={apiKey}
            marketId={firstMarket.id}
            marketName={firstMarket.name}
            defaultCenter={defaultCenter}
          />
        )}
      </div>
    </div>
  );
}
