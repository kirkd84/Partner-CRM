/**
 * /generate-leads — top-level Tool that consolidates every "find new
 * names to call" path into one screen.
 *
 * Three sources today:
 *   1. Lasso a territory (was inside /map)
 *   2. Upload a state-board CSV (was at /admin/state-boards)
 *   3. Browse the prospect queue → /admin/scraped-leads
 *
 * The lasso is the day-to-day path; the others are admin-driven. Reps
 * get the lasso entrypoint; manager+ gets all three.
 */

import Link from 'next/link';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Card, Pill } from '@partnerradar/ui';
import {
  ArrowRight,
  FileSpreadsheet,
  Inbox,
  Lasso,
  Map as MapIcon,
  Search,
  Upload,
} from 'lucide-react';
import { prisma } from '@partnerradar/db';
import { activeTenantId } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

export default async function GenerateLeadsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isManagerPlus =
    session.user.role === 'ADMIN' ||
    session.user.role === 'MANAGER' ||
    session.user.role === 'SUPER_ADMIN';

  // Surface a count of pending scraped leads so reps know if there's
  // already work in the queue before kicking off a new lasso.
  const tenantId = await activeTenantId(session);
  const pendingScraped = await prisma.scrapedLead
    .count({
      where: {
        status: 'PENDING',
        ...(tenantId ? { market: { tenantId } } : { market: { tenantId: '__none__' } }),
      },
    })
    .catch(() => 0);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="border-b border-card-border bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Generate Leads</h1>
          {pendingScraped > 0 && (
            <Pill tone="soft" color="amber">
              {pendingScraped} waiting for review
            </Pill>
          )}
        </div>
        <p className="mt-1 text-[11px] text-gray-500 sm:text-xs">
          Everything that brings new partner names into the system. Pick a path; results land in the
          prospect queue for review before they become real partners.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto grid w-full max-w-4xl gap-4 sm:grid-cols-2">
          <SourceCard
            href="/map?lasso=1"
            icon={Lasso}
            title="Lasso a territory"
            tagline="Map-driven · Google Places"
            description="Draw a polygon on the map, pick partner types, and we scrape Google Places inside the shape. Best for finding businesses in a specific neighborhood you're about to canvas."
            badge="Most common"
          />
          {isManagerPlus && (
            <SourceCard
              href="/admin/state-boards"
              icon={FileSpreadsheet}
              title="State board CSV"
              tagline="Public records · CO / TX / FL"
              description="Upload a realty or insurance licensee CSV from a state board. Imports every active license into the prospect queue. Free; covers 100% of licensed agents."
            />
          )}
          {isManagerPlus && (
            <SourceCard
              href="/admin/import-partners"
              icon={Upload}
              title="Import existing book"
              tagline="From your old CRM"
              description="Drop a CSV from your prior CRM or a spreadsheet. Goes directly to active Partners (skips the review queue). Use this once when onboarding."
            />
          )}
          <SourceCard
            href="/admin/scraped-leads"
            icon={Inbox}
            title="Prospect queue"
            tagline="Review pending leads"
            description={
              pendingScraped > 0
                ? `${pendingScraped} new lead${pendingScraped === 1 ? '' : 's'} waiting for review. Approve, edit, or reject — approved leads become Partners.`
                : 'No leads waiting today. Run a lasso scrape or state board import to fill the queue.'
            }
          />
          {isManagerPlus && (
            <SourceCard
              href="/admin/scrape-jobs"
              icon={MapIcon}
              title="Scheduled scrape jobs"
              tagline="Recurring lasso jobs"
              description="Configure jobs to re-run a saved lasso (or state-board import) on a daily / weekly cadence. Requires CRON_SECRET and an external cron pinging /api/cron/scrape-tick."
            />
          )}
        </div>

        <div className="mx-auto mt-6 max-w-4xl text-[11px] text-gray-500">
          <p>
            Every source feeds the same prospect queue at{' '}
            <Link href="/admin/scraped-leads" className="font-medium text-primary hover:underline">
              /admin/scraped-leads
            </Link>
            . Leads dedupe by license number (state boards) or business name + address (Google
            Places) so re-runs don&apos;t pile up duplicates.
          </p>
        </div>
      </div>
    </div>
  );
}

function SourceCard({
  href,
  icon: Icon,
  title,
  tagline,
  description,
  badge,
}: {
  href: string;
  icon: typeof Search;
  title: string;
  tagline: string;
  description: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-lg border border-card-border bg-white p-4 shadow-card transition hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-blue-50 text-primary ring-1 ring-inset ring-blue-100">
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <div className="flex items-start gap-2">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {badge && (
              <Pill tone="soft" color="emerald">
                {badge}
              </Pill>
            )}
          </div>
          <div className="text-[11px] uppercase tracking-label text-gray-500">{tagline}</div>
        </div>
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-gray-700">{description}</p>
    </Link>
  );
}
