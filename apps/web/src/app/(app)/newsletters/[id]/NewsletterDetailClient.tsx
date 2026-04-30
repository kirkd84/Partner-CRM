'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@partnerradar/ui';
import { Send, Trash2, Mail, XCircle } from 'lucide-react';
import { deleteNewsletterDraft, sendNewsletter, cancelScheduledNewsletter } from '../actions';

export function NewsletterDetailClient({
  id,
  status,
  recipientCount,
  errorSamples,
}: {
  id: string;
  status: string;
  subject: string;
  bodyText: string;
  recipientCount: number;
  errorSamples: Array<{ partnerId: string; email: string; error: string }> | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function onSendNow() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        const r = await sendNewsletter(id);
        setInfo(
          `Sent to ${r.sentCount} of ${r.recipientCount}. ${r.blockedCount} skipped, ${r.errorCount} failed.`,
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Send failed');
      }
    });
  }

  function onDelete() {
    if (!confirm('Delete this draft? This cannot be undone.')) return;
    startTransition(async () => {
      try {
        await deleteNewsletterDraft(id);
        router.push('/newsletters');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
    });
  }

  function onCancelScheduled() {
    if (
      !confirm(
        'Cancel this scheduled send? The newsletter goes back to DRAFT — you can edit + reschedule.',
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      try {
        await cancelScheduledNewsletter(id);
        setInfo('Scheduled send canceled — newsletter is back to DRAFT.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cancel failed');
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {info}
        </div>
      )}

      {status === 'DRAFT' && (
        <Card title="Send">
          {!confirming ? (
            <Button onClick={() => setConfirming(true)} className="w-full">
              <Send className="h-4 w-4" /> Send now
            </Button>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5">
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <p className="text-[11px] text-amber-900">
                  Confirm the send. Once out, you can&apos;t unsend.
                </p>
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirming(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={onSendNow} className="flex-1">
                  <Send className="h-3.5 w-3.5" /> Send now
                </Button>
              </div>
            </div>
          )}
          <Button
            onClick={onDelete}
            variant="secondary"
            className="mt-2 w-full text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" /> Delete draft
          </Button>
        </Card>
      )}

      {status === 'SCHEDULED' && (
        <Card title="Scheduled">
          <p className="text-xs text-gray-600">
            The cron tick will fire this send at its scheduled time. Cancel below to put it back
            into DRAFT and stop the send from going out.
          </p>
          <Button
            onClick={onCancelScheduled}
            variant="secondary"
            className="mt-2 w-full text-amber-700 hover:bg-amber-50"
          >
            <XCircle className="h-4 w-4" /> Cancel scheduled send
          </Button>
        </Card>
      )}

      {status === 'SENDING' && (
        <Card title="In flight">
          <p className="text-xs text-gray-600">
            Send is in progress. Refresh in a minute to see updated counts. The send loops
            sequentially so a 500-recipient list takes ~5 minutes.
          </p>
        </Card>
      )}

      {(status === 'SENT' || status === 'FAILED') && errorSamples && errorSamples.length > 0 && (
        <Card title={`Errors (${errorSamples.length})`}>
          <ul className="space-y-2 text-[11px] text-gray-700">
            {errorSamples.slice(0, 10).map((e, idx) => (
              <li key={idx} className="border-b border-gray-100 pb-1">
                <div className="font-mono text-[10.5px] text-gray-500">{e.email}</div>
                <div>{e.error}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(status === 'SENT' || status === 'FAILED') && (
        <Card title="Audience">
          <p className="text-xs text-gray-600">
            {recipientCount} partner{recipientCount === 1 ? '' : 's'} matched the audience filter
            and had a primary contact email at send time.
          </p>
        </Card>
      )}
    </div>
  );
}
