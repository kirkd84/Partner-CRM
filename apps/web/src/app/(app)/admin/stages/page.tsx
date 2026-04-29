/**
 * /admin/stages — manager+ page to rename, recolor, and reorder
 * partner stages. The underlying enum stays the source of truth for
 * type safety + cadence triggers; this UI only writes display
 * overrides into StageConfig.
 *
 * Per-tenant rows take precedence over the global default rows
 * (tenantId = NULL) which the boot-time seed inserts. If a tenant has
 * no overrides yet, we fall back to the globals so the page never
 * shows a blank list.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { Card, Pill } from '@partnerradar/ui';
import { Layers } from 'lucide-react';
import { activeTenantId } from '@/lib/tenant/context';
import { StagesEditor } from './StagesEditor';
import { STAGE_LABELS, STAGE_COLORS, ORDERED_STAGES, type PartnerStage } from '@partnerradar/types';

export const dynamic = 'force-dynamic';

export default async function AdminStagesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (
    session.user.role !== 'MANAGER' &&
    session.user.role !== 'ADMIN' &&
    session.user.role !== 'SUPER_ADMIN'
  ) {
    redirect('/radar');
  }

  const tenantId = await activeTenantId(session);

  // Pull tenant overrides + globals; tenant entries win for the
  // stages they cover, globals fill in the rest.
  const [tenantRows, globalRows] = await Promise.all([
    tenantId
      ? prisma.stageConfig
          .findMany({
            where: { tenantId },
            orderBy: { sortOrder: 'asc' },
          })
          .catch(() => [])
      : Promise.resolve([]),
    prisma.stageConfig
      .findMany({ where: { tenantId: null }, orderBy: { sortOrder: 'asc' } })
      .catch(() => []),
  ]);

  const byStage = new Map<
    PartnerStage,
    { label: string; color: string; sortOrder: number; source: 'tenant' | 'global' | 'fallback' }
  >();
  for (const r of globalRows) {
    byStage.set(r.stage as PartnerStage, {
      label: r.label,
      color: r.color,
      sortOrder: r.sortOrder,
      source: 'global',
    });
  }
  for (const r of tenantRows) {
    byStage.set(r.stage as PartnerStage, {
      label: r.label,
      color: r.color,
      sortOrder: r.sortOrder,
      source: 'tenant',
    });
  }
  // Last-resort fallback to the constants in @partnerradar/types so
  // the page never shows blank rows even on a fresh DB before the
  // seed has run.
  for (const stage of ORDERED_STAGES) {
    if (!byStage.has(stage)) {
      byStage.set(stage, {
        label: STAGE_LABELS[stage],
        color: STAGE_COLORS[stage],
        sortOrder: ORDERED_STAGES.indexOf(stage),
        source: 'fallback',
      });
    }
  }

  const rows = ORDERED_STAGES.map((stage) => ({
    stage,
    ...byStage.get(stage)!,
  })).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="p-6">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
          <Layers className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Partner stages</h1>
          <p className="text-xs text-gray-500">
            Rename, recolor, or reorder stages to match your team&apos;s vocabulary. Adding net-new
            stages is intentionally not supported yet — would require code changes to cadences,
            funnels, and the rep workflow. Reach out to support if you need a new stage.
          </p>
        </div>
        {tenantId ? (
          <Pill tone="soft" color="blue">
            Tenant overrides active
          </Pill>
        ) : (
          <Pill tone="soft" color="gray">
            Editing global defaults
          </Pill>
        )}
      </header>

      <div className="mt-5">
        <Card>
          <StagesEditor initialRows={rows} hasTenant={Boolean(tenantId)} />
        </Card>
      </div>

      <p className="mt-3 text-[10.5px] text-gray-400">
        Behind the scenes, the underlying stage enum (NEW_LEAD, RESEARCHED, …) is unchanged — only
        the labels and colors you see in the rest of the app come from this table. Existing partner
        records, cadences, and reports keep working.
      </p>
    </div>
  );
}
