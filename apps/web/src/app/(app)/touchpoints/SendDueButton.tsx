'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2 } from 'lucide-react';
import { sendAllDueTouchpoints } from './actions';

/**
 * "Send all due" button — fires every SCHEDULED touchpoint whose
 * scheduledFor is past. Capped at 50 sends per click in the action;
 * if the queue is bigger the manager just clicks again.
 */
export function SendDueButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [, start] = useTransition();

  function go() {
    if (!confirm('Send every touchpoint whose schedule is in the past? Capped at 50 per click.'))
      return;
    setBusy(true);
    setFeedback(null);
    start(async () => {
      try {
        const r = await sendAllDueTouchpoints();
        if (r.total === 0) {
          setFeedback('Nothing was due.');
        } else {
          setFeedback(
            `Sent ${r.sent}${r.failed > 0 ? `, failed ${r.failed}` : ''} of ${r.total} due.`,
          );
        }
        router.refresh();
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Send all due
      </button>
      {feedback && <span className="text-[11px] text-gray-500">{feedback}</span>}
    </div>
  );
}
