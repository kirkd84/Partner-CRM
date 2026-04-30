'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, UserMinus, Loader2 } from 'lucide-react';
import { setEnrollmentStatus } from '../actions';

export function EnrollmentActions({
  enrollmentId,
  status,
}: {
  enrollmentId: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'UNSUBSCRIBED';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  function call(next: 'ACTIVE' | 'PAUSED' | 'UNSUBSCRIBED') {
    setBusy(next);
    start(async () => {
      try {
        await setEnrollmentStatus(enrollmentId, next);
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  // Completed enrollments are terminal — no buttons.
  if (status === 'COMPLETED') return null;

  return (
    <div className="flex items-center justify-end gap-1">
      {status === 'ACTIVE' && (
        <button
          type="button"
          onClick={() => call('PAUSED')}
          disabled={busy !== null}
          className="rounded p-1 text-gray-500 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-60"
          aria-label="Pause"
          title="Pause this enrollment"
        >
          {busy === 'PAUSED' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      {status === 'PAUSED' && (
        <button
          type="button"
          onClick={() => call('ACTIVE')}
          disabled={busy !== null}
          className="rounded p-1 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-60"
          aria-label="Resume"
          title="Resume — next step fires on next cron tick"
        >
          {busy === 'ACTIVE' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      {status !== 'UNSUBSCRIBED' && (
        <button
          type="button"
          onClick={() => {
            if (!confirm('Unsubscribe this partner from the drip? Cannot be undone.')) return;
            call('UNSUBSCRIBED');
          }}
          disabled={busy !== null}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
          aria-label="Unsubscribe"
          title="Unsubscribe from this drip"
        >
          {busy === 'UNSUBSCRIBED' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserMinus className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
