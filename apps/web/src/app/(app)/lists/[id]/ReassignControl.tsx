'use client';

/**
 * Reassign a hit list (and its parent plan, when present) to another
 * rep in the same market. Manager+ only — the parent renders this
 * conditionally based on the role.
 *
 * Lazy-loads the list of eligible reps when the dropdown opens, so the
 * page render isn't blocked on a UserMarket join the manager probably
 * never opens.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Loader2 } from 'lucide-react';
import { listReassignTargets, reassignHitList } from '../actions';

interface Target {
  id: string;
  name: string;
  email: string;
}

export function ReassignControl({ listId }: { listId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  async function openPicker() {
    setOpen(true);
    if (targets !== null) return;
    setLoading(true);
    setError(null);
    try {
      const t = await listReassignTargets(listId);
      setTargets(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reps');
    } finally {
      setLoading(false);
    }
  }

  function reassign(userId: string) {
    setError(null);
    start(async () => {
      try {
        await reassignHitList(listId, userId);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reassign failed');
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        <UserPlus className="h-3.5 w-3.5" /> Reassign
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
            Reassign to…
          </div>
          {loading && (
            <div className="flex items-center gap-2 p-3 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading reps…
            </div>
          )}
          {!loading && targets && targets.length === 0 && (
            <p className="p-3 text-xs text-gray-500">No other active reps in this market.</p>
          )}
          {!loading && targets && targets.length > 0 && (
            <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
              {targets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => reassign(t.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="flex-1 truncate">
                      <span className="block font-medium text-gray-900">{t.name}</span>
                      <span className="block text-[10.5px] text-gray-500">{t.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {error}
            </div>
          )}
          <div className="border-t border-gray-100 px-3 py-2 text-right">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-gray-500 hover:text-gray-900"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
