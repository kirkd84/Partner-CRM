'use client';

/**
 * Horizontal action strip under the preview — download, change status,
 * archive. Wraps gracefully on narrow viewports.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  CheckCircle2,
  Archive,
  RefreshCw,
  ChevronDown,
  Printer,
  CreditCard,
  FileText,
} from 'lucide-react';
import { Button } from '@partnerradar/ui';
import { updateDesignStatus, regenerateDesign } from '../actions';

interface Props {
  designId: string;
  currentStatus: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'FINAL' | 'ARCHIVED';
  width: number;
  height: number;
  /**
   * Template category — informs the default PDF layout. 'business-cards'
   * defaults to the 10-up tile sheet; everything else defaults to a
   * single design centered on Letter.
   */
  templateKind?: 'flyer' | 'business-card' | 'social' | 'other';
}

export function DesignActions({ designId, currentStatus, templateKind }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);

  const defaultLayout: 'cards' | 'letter' | 'native' =
    templateKind === 'business-card' ? 'cards' : 'letter';

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

      {/* PDF dropdown — primary click goes to the default layout (Letter
          for flyers, 10-up cards for business cards). The chevron opens a
          menu with the other layout choices so Kirk can pick "native size"
          when sending to a print shop. */}
      <div className="relative">
        <div className="inline-flex">
          <a
            href={`/api/studio/designs/${designId}/pdf?layout=${defaultLayout}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-l-md border border-r-0 border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-primary hover:text-primary"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF
          </a>
          <button
            type="button"
            onClick={() => setPdfMenuOpen((s) => !s)}
            className="inline-flex items-center rounded-r-md border border-gray-300 bg-white px-1.5 py-1.5 text-gray-600 transition hover:border-primary hover:text-primary"
            aria-label="Choose PDF layout"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        {pdfMenuOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
            <a
              href={`/api/studio/designs/${designId}/pdf?layout=letter`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setPdfMenuOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              <FileText className="h-3.5 w-3.5 text-gray-500" />
              <span>
                Letter (8.5×11)
                <span className="ml-1 text-[10px] text-gray-400">flyer / handout</span>
              </span>
            </a>
            <a
              href={`/api/studio/designs/${designId}/pdf?layout=cards`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setPdfMenuOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              <CreditCard className="h-3.5 w-3.5 text-gray-500" />
              <span>
                Business cards (10-up)
                <span className="ml-1 text-[10px] text-gray-400">cut sheet</span>
              </span>
            </a>
            <a
              href={`/api/studio/designs/${designId}/pdf?layout=native`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setPdfMenuOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              <Printer className="h-3.5 w-3.5 text-gray-500" />
              <span>
                Native size
                <span className="ml-1 text-[10px] text-gray-400">print shop</span>
              </span>
            </a>
          </div>
        )}
      </div>
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
