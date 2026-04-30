'use client';

/**
 * Action bar at the top of /lists/plans/[id]: Regenerate + Delete.
 *
 * Regenerate re-runs the planner against the saved sourceMeta + config
 * (after dropping the old day rows) — useful when partners change in
 * the area between builds. Delete drops the parent + leaves the
 * already-touched HitList rows alone (their planId becomes null).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { regeneratePlan, deletePlan } from '../actions';

export function PlanActions({ planId }: { planId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'regen' | 'delete' | null>(null);
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function regen() {
    setError(null);
    setBusy('regen');
    start(async () => {
      try {
        const r = await regeneratePlan(planId);
        router.replace(`/lists/plans/${r.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Regenerate failed');
      } finally {
        setBusy(null);
      }
    });
  }

  function del() {
    if (
      !confirm(
        'Delete this plan? The day-by-day hit lists stay (you can keep using them); only the plan parent is removed.',
      )
    )
      return;
    setError(null);
    setBusy('delete');
    start(async () => {
      try {
        await deletePlan(planId);
        router.push('/lists');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
        setBusy(null);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={regen}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        {busy === 'regen' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Regenerate
      </button>
      <button
        type="button"
        onClick={del}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        {busy === 'delete' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Delete plan
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
