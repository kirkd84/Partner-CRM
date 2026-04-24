'use client';

/**
 * Horizontal action strip under the preview — download, change status,
 * archive. Wraps gracefully on narrow viewports.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, CheckCircle2, Archive, RefreshCw } from 'lucide-react';
import { Button } from '@partnerradar/ui';
import { updateDesignStatus, regenerateDesign } from '../actions';

interface Props {
  designId: string;
  currentStatus: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'FINAL' | 'ARCHIVED';
  width: number;
  height: number;
}

export function DesignActions({ designId, currentStatus }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nextStatus: Props['currentStatus'] =
    currentStatus === 'DRAFT' ? 'APPROVED' : currentStatus === 'APPROVED' ? 'FINAL' : 'DRAFT';
  const nextLabel =
    currentStatus === 'DRAFT'
      ? 'Mark approved'
      : currentStatus === 'APPROVED'
        ? 'Mark final'
        : 'Back to draft';

  function onStatus(s: Props['currentStatus']) {
    startTransition(async () => {
      await updateDesignStatus(designId, s);
      router.refresh();
    });
  }

  function onRegenerate() {
    startTransition(async () => {
      await regenerateDesign(designId, {});
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <a
        href={`/api/studio/designs/${designId}/png`}
        download
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-primary hover:text-primary"
      >
        <Download className="h-3.5 w-3.5" /> PNG
      </a>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-primary hover:text-primary disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} /> Regenerate
      </button>
      {currentStatus !== 'ARCHIVED' ? (
        <Button variant="secondary" onClick={() => onStatus(nextStatus)} disabled={isPending}>
          <CheckCircle2 className="h-3.5 w-3.5" /> {nextLabel}
        </Button>
      ) : null}
      {currentStatus !== 'ARCHIVED' ? (
        <button
          type="button"
          onClick={() => onStatus('ARCHIVED')}
          disabled={isPending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-gray-500 transition hover:text-red-600"
        >
          <Archive className="h-3.5 w-3.5" /> Archive
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onStatus('DRAFT')}
          disabled={isPending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-gray-500 transition hover:text-primary"
        >
          Unarchive
        </button>
      )}
    </div>
  );
}
