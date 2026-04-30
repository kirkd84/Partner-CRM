'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pill } from '@partnerradar/ui';
import { Edit2, Trash2, Check, X } from 'lucide-react';
import { renameTag, deleteTagEverywhere } from './actions';

export function TagRowClient({ tag, count }: { tag: string; count: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag);
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (draft.trim() === tag || !draft.trim()) {
      setEditing(false);
      setDraft(tag);
      return;
    }
    setError(null);
    setBusy(true);
    start(async () => {
      try {
        await renameTag(tag, draft.trim());
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Rename failed');
      } finally {
        setBusy(false);
      }
    });
  }

  function del() {
    if (
      !confirm(
        `Delete "${tag}" from every partner who has it? This affects ${count} partner${count === 1 ? '' : 's'} and cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    start(async () => {
      try {
        await deleteTagEverywhere(tag);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <li className="flex items-center gap-2 py-2">
      {!editing ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
          {tag}
        </span>
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') {
              setEditing(false);
              setDraft(tag);
            }
          }}
          className="rounded-md border border-gray-300 px-2 py-0.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
        />
      )}
      <Pill tone="soft" color="gray">
        {count} partner{count === 1 ? '' : 's'}
      </Pill>
      <Link
        href={`/partners?tag=${encodeURIComponent(tag)}`}
        className="text-[11px] text-primary hover:underline"
      >
        View partners
      </Link>
      <div className="ml-auto flex items-center gap-1">
        {editing ? (
          <>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-md p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-60"
              aria-label="Save rename"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(tag);
              }}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-primary"
              aria-label="Rename"
              title="Rename"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={del}
              disabled={busy}
              className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
              aria-label="Delete"
              title="Delete tag everywhere"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      {error && <span className="text-[10.5px] text-red-600">{error}</span>}
    </li>
  );
}
