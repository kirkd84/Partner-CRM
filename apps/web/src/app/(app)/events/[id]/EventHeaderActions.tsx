'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@partnerradar/ui';
import { XCircle, QrCode } from 'lucide-react';
import { cancelEvent } from '../actions';

export function EventHeaderActions({
  eventId,
  canEdit,
  canceled,
}: {
  eventId: string;
  canEdit: boolean;
  canceled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!canEdit || canceled) {
    // Hosts still see the check-in link even on canceled events so
    // they can retroactively fix attendance; but let's hide on
    // canceled for now to keep it simple.
    return null;
  }

  function onCancel() {
    if (!reason.trim()) {
      setError('Say why — it shows up in the activity feed');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await cancelEvent(eventId, reason.trim());
        setShowConfirm(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <div className="relative flex items-center gap-2">
      <Link
        href={`/events/${eventId}/check-in`}
        className="flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-900 transition hover:border-indigo-300 hover:bg-indigo-100"
      >
        <QrCode className="h-3.5 w-3.5" /> Check-in
      </Link>
      <button
        type="button"
        onClick={() => setShowConfirm((v) => !v)}
        className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-red-300 hover:text-red-700"
      >
        <XCircle className="h-3.5 w-3.5" /> Cancel event
      </button>
      {showConfirm && (
        <div className="absolute right-0 top-10 z-10 w-80 rounded-md border border-card-border bg-white p-3 shadow-lg">
          <p className="text-xs font-semibold text-gray-900">Cancel this event?</p>
          <p className="mt-1 text-[11px] text-gray-500">
            Pending reminders stop firing. Invitees don't auto-notify — send your own apology.
          </p>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required, shown in activity log)"
            className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-1">
            <Button variant="secondary" size="sm" onClick={() => setShowConfirm(false)}>
              Never mind
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onCancel}
              loading={isPending}
              disabled={!reason.trim()}
            >
              Cancel event
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
