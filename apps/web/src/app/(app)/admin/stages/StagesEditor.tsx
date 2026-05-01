'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Pill } from '@partnerradar/ui';
import { ArrowDown, ArrowUp, Save } from 'lucide-react';
import type { PartnerStage } from '@partnerradar/types';
import { upsertStageConfig, reorderStages } from './actions';

interface Row {
  stage: PartnerStage;
  label: string;
  color: string;
  sortOrder: number;
  source: 'tenant' | 'global' | 'fallback';
}

// 12 high-contrast presets — one swatch per visually distinct hue family
// + two neutrals at opposite brightness, so two stages can never collide
// at a glance. The previous palette had two blues (sky/blue), two purples
// (violet/purple), two grays (slate/gray), and emerald sitting on top of
// teal — Kirk flagged them as indistinguishable in the picker grid.
const COLOR_PRESETS = [
  '#0f172a', // near-black slate
  '#64748b', // mid slate gray
  '#0891b2', // cyan
  '#2563eb', // royal blue
  '#7c3aed', // deep violet
  '#db2777', // magenta pink
  '#dc2626', // strong red
  '#f97316', // orange
  '#facc15', // golden yellow
  '#84cc16', // lime green
  '#059669', // emerald
  '#854d0e', // brown
];

export function StagesEditor({
  initialRows,
  hasTenant,
}: {
  initialRows: Row[];
  hasTenant: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [savingStage, setSavingStage] = useState<PartnerStage | null>(null);
  const [reordering, setReordering] = useState(false);
  const [, startTransition] = useTransition();
  const [savedToast, setSavedToast] = useState<string | null>(null);

  function setLabel(stage: PartnerStage, label: string) {
    setRows((prev) => prev.map((r) => (r.stage === stage ? { ...r, label } : r)));
  }
  function setColor(stage: PartnerStage, color: string) {
    setRows((prev) => prev.map((r) => (r.stage === stage ? { ...r, color } : r)));
  }
  function move(stage: PartnerStage, dir: -1 | 1) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.stage === stage);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next]!, arr[idx]!];
      return arr;
    });
  }

  function onSaveRow(row: Row) {
    setSavingStage(row.stage);
    startTransition(async () => {
      try {
        await upsertStageConfig({
          stage: row.stage,
          label: row.label,
          color: row.color,
          sortOrder: row.sortOrder,
        });
        setSavedToast(`${row.label} saved`);
        window.setTimeout(() => setSavedToast(null), 2500);
        router.refresh();
      } catch (err) {
        setSavedToast(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSavingStage(null);
      }
    });
  }

  function onSaveOrder() {
    setReordering(true);
    startTransition(async () => {
      try {
        await reorderStages(rows.map((r) => r.stage));
        setSavedToast('Order saved');
        window.setTimeout(() => setSavedToast(null), 2500);
        router.refresh();
      } catch (err) {
        setSavedToast(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setReordering(false);
      }
    });
  }

  return (
    <>
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div
            key={row.stage}
            className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 px-3 py-2 hover:border-gray-200"
          >
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(row.stage, -1)}
                disabled={idx === 0}
                aria-label="Move up"
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => move(row.stage, 1)}
                disabled={idx === rows.length - 1}
                aria-label="Move down"
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>

            <div
              className="h-6 w-6 flex-shrink-0 rounded-full border border-white shadow-sm"
              style={{ backgroundColor: row.color }}
            />

            <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <input
                type="text"
                value={row.label}
                onChange={(e) => setLabel(row.stage, e.target.value)}
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm sm:flex-1"
              />
              <span className="font-mono text-[10px] text-gray-400">{row.stage}</span>
            </div>

            <div className="flex items-center gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(row.stage, c)}
                  aria-label={`Set color ${c}`}
                  className={`h-4 w-4 rounded-full border transition ${
                    row.color === c
                      ? 'border-gray-900 ring-2 ring-gray-300'
                      : 'border-white shadow-sm'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={row.color}
                onChange={(e) => setColor(row.stage, e.target.value)}
                aria-label="Custom color"
                className="h-5 w-6 cursor-pointer rounded border border-gray-200"
              />
            </div>

            <div className="flex items-center gap-2">
              <Pill
                tone="soft"
                color={
                  row.source === 'tenant' ? 'blue' : row.source === 'global' ? 'gray' : 'amber'
                }
              >
                {row.source === 'tenant'
                  ? 'override'
                  : row.source === 'global'
                    ? 'default'
                    : 'fallback'}
              </Pill>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onSaveRow(row)}
                loading={savingStage === row.stage}
              >
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
        <p className="text-[11px] text-gray-500">
          {hasTenant
            ? 'Saving creates a per-tenant override. Globals stay untouched.'
            : 'Editing as super-admin without acting-as a tenant — you are editing the global defaults.'}
        </p>
        <Button onClick={onSaveOrder} loading={reordering} className="ml-auto" size="sm">
          Save reorder
        </Button>
      </div>

      {savedToast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 rounded-md bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg"
        >
          {savedToast}
        </div>
      )}
    </>
  );
}
