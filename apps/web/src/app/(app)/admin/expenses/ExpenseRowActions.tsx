'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@partnerradar/ui';
import { Check, X } from 'lucide-react';
import { approveExpense, rejectExpense } from './actions';

export function ExpenseRowActions({
  expenseId,
  canAdmin,
}: {
  expenseId: string;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function doApprove() {
    setErr(null);
    startTransition(async () => {
      try {
        await approveExpense(expenseId);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  function doReject() {
    if (!reason.trim()) {
      setErr('Reason required');
      return;
    }
    setErr(null);
    startTransition(async () => {
      try {
        await rejectExpense(expenseId, reason.trim());
        setShowReject(false);
        setReason('');
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  if (showReject) {
    return (
      <div className="flex flex-col items-end gap-1">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason…"
          className="w-48 rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <div className="flex gap-1">
          <Button variant="secondary" onClick={() => setShowReject(false)}>
            Cancel
          </Button>
          <Button onClick={doReject} loading={isPending} disabled={!reason.trim()}>
            Reject
          </Button>
        </div>
        {err && <span className="text-[10px] text-red-700">{err}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={doApprove}
        disabled={isPending || !canAdmin}
        title={canAdmin ? 'Approve' : 'Admin only'}
        className="rounded p-1.5 text-gray-400 transition hover:bg-green-50 hover:text-green-600 disabled:opacity-40"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setShowReject(true)}
        disabled={isPending || !canAdmin}
        title={canAdmin ? 'Reject' : 'Admin only'}
        className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
