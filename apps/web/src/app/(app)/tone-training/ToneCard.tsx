'use client';

/**
 * Tone calibration card for /settings. Shows the rep's current tone
 * training status, the extracted profile summary (if available), and
 * a button to (re-)train. Opening the button mounts the same
 * ToneTrainingModal the first-login gate uses, so there's one code
 * path for training regardless of entry point.
 */

import { useState } from 'react';
import { Button } from '@partnerradar/ui';
import { Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { ToneTrainingModal } from './ToneTrainingModal';

type Status = 'NOT_STARTED' | 'IN_PROGRESS' | 'CALIBRATED' | 'REP_APPROVED';

interface Props {
  repName: string;
  status: Status;
  summary: string | null;
  aiConfigured: boolean;
}

export function ToneCard({ repName, status, summary, aiConfigured }: Props) {
  const [showModal, setShowModal] = useState(false);

  const statusBadge = (() => {
    switch (status) {
      case 'REP_APPROVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Calibrated and approved
          </span>
        );
      case 'CALIBRATED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
            <Sparkles className="h-3 w-3" /> Calibrated — needs your approval
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            <Loader2 className="h-3 w-3" /> Samples saved, extraction pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            Not trained yet
          </span>
        );
    }
  })();

  return (
    <>
      <div className="space-y-2">
        <div>{statusBadge}</div>
        <p className="text-xs text-gray-600">
          Partner Portal drafts emails + SMS in <strong>your</strong> voice. Train it once with a
          few real samples — adjust any time.
        </p>
        {summary && status !== 'NOT_STARTED' && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
            {summary}
          </div>
        )}
        <div className="pt-1">
          <Button onClick={() => setShowModal(true)} variant="secondary">
            <Sparkles className="h-4 w-4" />
            {status === 'NOT_STARTED' ? 'Train your voice' : 'Retrain tone'}
          </Button>
        </div>
      </div>

      {showModal && <ToneTrainingModal repName={repName} aiConfigured={aiConfigured} />}
    </>
  );
}
