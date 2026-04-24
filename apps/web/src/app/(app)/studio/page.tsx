/**
 * /studio — Marketing Wizard embedded shell.
 *
 * MW-3 refresh: big "New Design" CTA + recent designs grid tabbed by
 * status. Brand management moved into a compact sidebar link row so
 * the creative surface gets the spotlight.
 *
 * Mobile-first: stack everything top-to-bottom, horizontal-scroll the
 * tabs, and let the design grid fall to a single column.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import Link from 'next/link';
import { Sparkles, Plus, Paintbrush } from 'lucide-react';
import { Pill } from '@partnerradar/ui';

export const dynamic = 'force-dynamic';

type TabId = 'drafts' | 'approved' | 'archived';
const TABS: Array<{ id: TabId; label: string; statuses: string[] }> = [
  { id: 'drafts', label: 'Drafts', statuses: ['DRAFT', 'REVIEW'] },
  { id: 'approved', label: 'Approved', statuses: ['APPROVED', 'FINAL'] },
  { id: 'archived', label: 'Archived', statuses: ['ARCHIVED'] },
];

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/radar');
  const sp = await searchParams;
  const tab: TabId = (TABS.map((t) => t.id) as string[]).includes(sp.tab ?? '')
    ? (sp.tab as TabId)
    : 'drafts';
  const activeTab = TABS.find((t) => t.id === tab)!;

  const markets = session.user.markets ?? [];

  let workspaces: Array<{
    id: string;
    name: string;
    plan: string;
    _count: { members: number; brands: number; designs: number };
  }> = [];
  try {
    workspaces = await prisma.mwWorkspace.findMany({
      where: session.user.role === 'ADMIN' ? {} : { partnerRadarMarketId: { in: markets } },
      select: {
        id: true,
        name: true,
        plan: true,
        _count: { select: { members: true, brands: true, designs: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  } catch {
    workspaces = [];
  }

  const workspaceIds = workspaces.map((w) => w.id);
  let designs: Array<{
    id: string;
    name: string;
    contentType: string;
    status: string;
    updatedAt: Date;
    brand: { name: string };
    document: unknown;
  }> = [];
  if (workspaceIds.length > 0) {
    try {
      designs = await prisma.mwDesign.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          status: { in: activeTab.statuses as never[] },
        },
        select: {
          id: true,
          name: true,
          contentType: true,
          status: true,
          updatedAt: true,
          brand: { select: { name: true } },
          document: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 24,
      });
    } catch {
      designs = [];
    }
  }

  const primaryWorkspaceId = workspaces[0]?.id;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white">
        <div className="flex items-start gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Studio</h1>
              <Pill color="#6366f1" tone="soft">
                Preview
              </Pill>
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500 sm:text-xs">
              Describe what you want. Studio picks a template, writes the copy, and renders it
              on-brand.
            </p>
          </div>
          {primaryWorkspaceId && (
            <Link
              href={`/studio/new?workspaceId=${primaryWorkspaceId}`}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 sm:px-5"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New design</span>
              <span className="sm:hidden">New</span>
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-canvas">
        <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
          {/* Brand link strip — small, not dominating. */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-card-border bg-white px-3 py-2.5 text-xs text-gray-600">
            <Paintbrush className="h-3.5 w-3.5 text-gray-400" />
            <span>Brand-matching uses your active brand.</span>
            <Link
              href="/studio/brands"
              className="ml-auto rounded-md border border-gray-300 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:border-primary hover:text-primary"
            >
              Manage brands
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200">
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={`/studio?tab=${t.id}`}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${
                  tab === t.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {/* Design grid */}
          {designs.length === 0 ? (
            <EmptyGrid tab={tab} primaryWorkspaceId={primaryWorkspaceId} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {designs.map((d) => {
                const doc = d.document as {
                  width?: number;
                  height?: number;
                  variant?: string;
                } | null;
                const aspect = doc?.width && doc?.height ? `${doc.width} / ${doc.height}` : '1 / 1';
                return (
                  <Link
                    key={d.id}
                    href={`/studio/designs/${d.id}`}
                    className="group flex flex-col overflow-hidden rounded-xl border border-card-border bg-white transition hover:shadow-md"
                  >
                    <div
                      className="relative overflow-hidden bg-gray-100"
                      style={{ aspectRatio: aspect }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/studio/designs/${d.id}/png?variant=${doc?.variant ?? 'light'}`}
                        alt={d.name}
                        loading="lazy"
                        className="h-full w-full object-contain transition group-hover:scale-[1.02]"
                      />
                    </div>
                    <div className="flex flex-col gap-1 p-2.5">
                      <div className="truncate text-xs font-semibold text-gray-900">{d.name}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        <span>{d.contentType.replace(/_/g, ' ').toLowerCase()}</span>
                        <span>·</span>
                        <span className="truncate">{d.brand.name}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyGrid({ tab, primaryWorkspaceId }: { tab: TabId; primaryWorkspaceId?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-gray-400" />
      <h2 className="mt-3 text-sm font-semibold text-gray-900">
        {tab === 'drafts'
          ? 'No drafts yet'
          : tab === 'approved'
            ? 'Nothing approved yet'
            : 'Nothing archived'}
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        {tab === 'drafts'
          ? 'Describe a flyer, social post, or card. Studio handles the rest.'
          : 'Once you mark a design approved it shows up here.'}
      </p>
      {tab === 'drafts' && primaryWorkspaceId && (
        <Link
          href={`/studio/new?workspaceId=${primaryWorkspaceId}`}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Start a design
        </Link>
      )}
    </div>
  );
}
