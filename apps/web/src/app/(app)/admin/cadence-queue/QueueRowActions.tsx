'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@partnerradar/ui';
import { CheckCircle2, XCircle } from 'lucide-react';
import { approveCadenceExecution, dropCadenceExecution } from './actions';

export function QueueRowActions({ executionId }: { executionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showDrop, setShowDrop] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  function onApprove() {
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await approveCadenceExecution(executionId);
        if (r.ok) {
          setMessage(`✓ ${r.outcome}${r.detail ? ` · ${r.detail}` : ''}`);
          setTimeout(() => router.refresh(), 1000);
        } else {
          setMessage(`Couldn't send: ${r.detail ?? 'failed'}`);
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onDrop() {
    if (!reason.trim()) return;
    startTransition(async () => {
      try {
        await dropCadenceExecution(executionId, reason.trim());
        setShowDrop(false);
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" onClick={onApprove} loading={isPending}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; send
        </Button>
        <button
          type="button"
          onClick={() => setShowDrop((v) => !v)}
          disabled={isPending}
          title="Don't send this one"
          className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      </div>
      {showDrop && (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="w-48 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={onDrop}
            disabled={!reason.trim() || isPending}
          >
            Drop
          </Button>
        </div>
      )}
      {message && <span className="text-[11px] text-gray-500">{message}</span>}
    </div>
  );
}
