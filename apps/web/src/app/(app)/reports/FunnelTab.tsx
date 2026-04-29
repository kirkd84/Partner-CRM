/**
 * Funnel tab — stage-to-stage conversion in the window.
 *
 * The funnel reads from STAGE_CHANGE activities which store the
 * previous/next stage. For each adjacent pair in ORDERED_STAGES we
 * count distinct partners that have EVER reached that stage in the
 * window, and conversion = next / prev.
 */

import { prisma, Prisma } from '@partnerradar/db';
import { Card } from '@partnerradar/ui';
import { ORDERED_STAGES, STAGE_COLORS, STAGE_LABELS } from '@partnerradar/types';
import { rangeToStart, type RangeId } from './range';

interface Props {
  range: RangeId;
  markets: string[];
  scopeAllMarkets: boolean;
}

export async function FunnelTab({ range, markets, scopeAllMarkets }: Props) {
  const since = rangeToStart(range);
  const partnerScope: Prisma.PartnerWhereInput = scopeAllMarkets
    ? { archivedAt: null }
    : { archivedAt: null, marketId: { in: markets } };

  // Simpler proxy for conversion: the ever-reached-that-stage count.
  // We use Partner.stageChangedAt to bound "entered stage X in window".
  // Current-stage distribution gives a snapshot; reaching-stage-X
  // gives flow.
  const [snapshot] = await Promise.all([
    prisma.partner.groupBy({
      by: ['stage'],
      where: partnerScope,
      _count: { stage: true },
    }),
  ]);

  // Reached-X in window — we scan Activity table for STAGE_CHANGE rows
  // with metadata.toStage = X. metadata is JSON so we use a raw query.
  const reachedRows = await prisma.$queryRaw<Array<{ stage: string; reached: bigint }>>`
    SELECT (a.metadata->>'toStage') AS stage, COUNT(DISTINCT a."partnerId")::bigint AS reached
    FROM "Activity" a
    INNER JOIN "Partner" p ON p.id = a."partnerId"
    WHERE a.type = 'STAGE_CHANGE'
      AND a."createdAt" >= ${since}
      AND p."archivedAt" IS NULL
      ${scopeAllMarkets ? Prisma.sql`` : Prisma.sql`AND p."marketId" = ANY(${markets})`}
    GROUP BY (a.metadata->>'toStage')
  `;

  const reachedByStage = new Map<string, number>();
  for (const r of reachedRows) {
    if (r.stage) reachedByStage.set(r.stage, Number(r.reached));
  }

  const currentByStage = new Map<string, number>();
  for (const row of snapshot) currentByStage.set(row.stage, row._count.stage);

  const pipelineTotal = Array.from(currentByStage.values()).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5 p-6">
      <Card title="Current pipeline distribution">
        <div className="space-y-2">
          {ORDERED_STAGES.map((stage) => {
            const count = currentByStage.get(stage) ?? 0;
            const pct = pipelineTotal > 0 ? (count / pipelineTotal) * 100 : 0;
            return (
              <div key={stage} className="grid grid-cols-[180px_1fr_60px] items-center gap-3">
                <div className="text-sm text-gray-900">{STAGE_LABELS[stage]}</div>
                <div className="relative h-5 overflow-hidden rounded bg-gray-100">
                  <div
                    className="h-full rounded"
                    style={{ width: `${pct}%`, backgroundColor: STAGE_COLORS[stage] }}
                  />
                </div>
                <div className="text-right font-mono text-sm tabular-nums text-gray-900">
                  {count}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-gray-500">
          Snapshot as of right now · {pipelineTotal.toLocaleString()} partners in active pipeline.
        </p>
      </Card>

      <Card title="Partners reaching each stage in the window">
        <div className="space-y-2">
          {ORDERED_STAGES.map((stage, idx) => {
            const reached = reachedByStage.get(stage) ?? 0;
            const prevStage = idx > 0 ? ORDERED_STAGES[idx - 1]! : null;
            const prevReached = prevStage ? (reachedByStage.get(prevStage) ?? 0) : null;
            const conv =
              prevReached !== null && prevReached > 0 ? (reached / prevReached) * 100 : null;
            const maxReached = Math.max(1, ...Array.from(reachedByStage.values()));
            const pct = (reached / maxReached) * 100;
            return (
              <div key={stage} className="grid grid-cols-[180px_1fr_100px_80px] items-center gap-3">
                <div className="text-sm text-gray-900">{STAGE_LABELS[stage]}</div>
                <div className="relative h-5 overflow-hidden rounded bg-gray-100">
                  <div
                    className="h-full rounded"
                    style={{ width: `${pct}%`, backgroundColor: STAGE_COLORS[stage] }}
                  />
                </div>
                <div className="text-right text-xs text-gray-500">
                  {conv !== null ? `${conv.toFixed(0)}% from prev.` : '—'}
                </div>
                <div className="text-right font-mono text-sm tabular-nums text-gray-900">
                  {reached}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-gray-500">
          Conversion is {'{stage reached count}'} / {'{previous stage reached count}'} within the
          window. Stage changes logged in Activity records.
        </p>
      </Card>
    </div>
  );
}
