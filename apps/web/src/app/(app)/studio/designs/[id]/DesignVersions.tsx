'use client';

/**
 * MW-4: version history timeline. Every regenerate / refine / slot
 * edit writes an MwDesignVersion. This panel lists them newest-first
 * and lets the user revert to any prior point. The revert itself is
 * also logged as a new version, so undo-the-undo works cleanly.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { History, RotateCcw, Loader2 } from 'lucide-react';
import { revertDesignToVersion } from '../actions';

interface VersionRow {
  id: string;
  changeLog: string;
  createdAt: string;
  createdBy: string;
}

export function DesignVersions({
  designId,
  versions,
}: {
  designId: string;
  versions: VersionRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (versions.length === 0) return null;

  function onRevert(versionId: string) {
    startTransition(async () => {
      try {
        await revertDesignToVersion(designId, versionId);
        router.refresh();
      } catch (err) {
        console.warn('[versions] revert failed', err);
      }
    });
  }

  return (
    <div className="rounded-xl border border-card-border bg-white p-4">
      <div className="flex items-center gap-2">
        <History className="h-3.5 w-3.5 text-gray-500" />
        <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
          History
        </div>
      </div>
      <ol className="mt-3 flex flex-col gap-2">
        {versions.slice(0, 12).map((v, i) => (
          <li
            key={v.id}
            className="flex items-start gap-2 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2 text-[12px]"
          >
            <span className="mt-0.5 font-mono text-[10px] text-gray-400">
              {i === 0 ? 'now' : `#${versions.length - i}`}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-gray-800">{v.changeLog}</div>
              <div className="text-[10px] text-gray-400">
                {new Date(v.createdAt).toLocaleString()}
              </div>
            </div>
            {i > 0 && (
              <button
                type="button"
                onClick={() => onRevert(v.id)}
                disabled={isPending}
                title="Revert to this version"
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 transition hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                Revert
              </button>
            )}
          </li>
        ))}
      </ol>
      {versions.length > 12 && (
        <p className="mt-2 text-[10px] text-gray-400">
          {versions.length - 12} older versions hidden.
        </p>
      )}
    </div>
  );
}
