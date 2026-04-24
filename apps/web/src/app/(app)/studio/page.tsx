/**
 * /studio — Marketing Wizard embedded shell.
 *
 * Placeholder until MW-2 (brand training) lands. Shows the caller's
 * auto-provisioned MwWorkspace + member list so they can see the
 * plumbing works end-to-end. Manager+ gate per SPEC_MARKETING.md §11.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { Card, Pill } from '@partnerradar/ui';
import { Sparkles, Paintbrush, LayoutGrid, Rocket } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/radar');

  const markets = session.user.markets ?? [];

  // Find the workspace attached to one of the caller's markets. Admins see
  // every workspace; managers see their markets' workspaces.
  let workspaces: Array<{
    id: string;
    name: string;
    plan: string;
    monthlyGenerationQuota: number;
    monthlyGenerationsUsed: number;
    market: { id: string; name: string } | null;
    _count: { members: number; brands: number; designs: number };
  }> = [];
  try {
    workspaces = await prisma.mwWorkspace.findMany({
      where: session.user.role === 'ADMIN' ? {} : { partnerRadarMarketId: { in: markets } },
      include: {
        market: { select: { id: true, name: true } },
        _count: { select: { members: true, brands: true, designs: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  } catch {
    workspaces = [];
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h1 className="text-xl font-semibold text-gray-900">Studio</h1>
          <Pill color="#6366f1" tone="soft">
            Preview
          </Pill>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Your AI brand designer. On-brand flyers, social posts, brochures, business cards — from
          one prompt.
        </p>
      </header>

      <div className="flex-1 overflow-auto bg-canvas p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          {workspaces.length === 0 ? (
            <Card title="Studio isn't wired to your markets yet">
              <p className="text-sm text-gray-700">
                A workspace gets auto-created on next server boot. Refresh in a minute.
              </p>
            </Card>
          ) : (
            workspaces.map((ws) => (
              <Card
                key={ws.id}
                title={
                  <span className="flex items-center gap-2">
                    <span>{ws.name}</span>
                    <Pill color="#6366f1" tone="soft">
                      {ws.plan}
                    </Pill>
                    {ws.market && (
                      <span className="text-[11px] text-gray-500">· {ws.market.name}</span>
                    )}
                  </span>
                }
              >
                <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
                  <dt className="text-[11px] uppercase tracking-label text-gray-500">Members</dt>
                  <dd className="text-gray-900">{ws._count.members}</dd>
                  <dt className="text-[11px] uppercase tracking-label text-gray-500">Brands</dt>
                  <dd className="text-gray-900">{ws._count.brands}</dd>
                  <dt className="text-[11px] uppercase tracking-label text-gray-500">Designs</dt>
                  <dd className="text-gray-900">{ws._count.designs}</dd>
                  <dt className="text-[11px] uppercase tracking-label text-gray-500">Quota</dt>
                  <dd className="text-gray-900">
                    {ws.plan === 'EMBEDDED'
                      ? 'Unlimited (embedded in Partner Portal)'
                      : `${ws.monthlyGenerationsUsed} / ${ws.monthlyGenerationQuota} generations this month`}
                  </dd>
                </dl>
              </Card>
            ))
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <RoadmapCard
              icon={<Paintbrush className="h-5 w-5 text-primary" />}
              phase="MW-2"
              title="Brand training"
              description="Upload 10–50 samples. Claude extracts colors, fonts, tone, layout motifs. Approve to lock in."
            />
            <RoadmapCard
              icon={<LayoutGrid className="h-5 w-5 text-primary" />}
              phase="MW-3"
              title="35-template catalog"
              description="Flyers, socials, brochures, business cards. One design, every channel — auto-resize."
            />
            <RoadmapCard
              icon={<Rocket className="h-5 w-5 text-primary" />}
              phase="MW-4+"
              title="Publish + print"
              description="Schedule to social, email to your CRM, order prints. All from the design."
            />
          </div>

          <Card title="Why Studio belongs inside Partner Portal">
            <p className="text-sm text-gray-700">
              Every event you create here gets an invite flyer. Every partner activation can trigger
              a personalized follow-up. Every campaign tracks back to the partners it reached.
              Studio is the creative engine; PartnerRadar is the delivery rails.
            </p>
            <p className="mt-3 text-[11px] text-gray-500">
              Architected with{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">MARKETING_MODE=embedded</code>
              today. Standalone SaaS extraction is a one-week project when we're ready —{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">
                MARKETING_MODE=standalone
              </code>{' '}
              lights up its own auth + billing + domain.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RoadmapCard({
  icon,
  phase,
  title,
  description,
}: {
  icon: React.ReactNode;
  phase: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-card-border bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50">{icon}</div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-gray-500">
          {phase}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-xs text-gray-600">{description}</p>
    </div>
  );
}
