'use client';

/**
 * Organizer view of active batch offers for an event.
 *
 * Shows each OPEN offer with:
 *   • ticket type name + how many recipients are racing for it
 *   • expiry countdown
 *   • [Cancel offer] to pull it early
 *
 * Historical offers (CLAIMED/EXPIRED/CANCELED) collapse to a one-line
 * summary; we don't want this card to grow unbounded on a busy event.
 */

import { useState, useTransition } from 'react';
import { cancelBatchOffer } from './batch-offer-actions';

interface Offer {
  id: string;
  ticketTypeName: string;
  status: 'OPEN' | 'CLAIMED' | 'EXPIRED' | 'CANCELED';
  expiresAt: string;
  createdAt: string;
  recipientCount: number;
  claimedByName: string | null;
}

interface Props {
  eventId: string;
  offers: Offer[];
  canEdit: boolean;
}

export function BatchOffersCard({ eventId, offers, canEdit }: Props) {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(offers);

  if (rows.length === 0) return null;

  const open = rows.filter((o) => o.status === 'OPEN');
  const history = rows.filter((o) => o.status !== 'OPEN').slice(0, 5);

  function doCancel(id: string) {
    startTransition(async () => {
      try {
        const res = await cancelBatchOffer({ eventId, batchOfferId: id });
        if (res.ok) {
          setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: 'CANCELED' as const } : r)),
          );
        }
      } catch (err) {
        console.warn('[batch-offers] cancel failed', err);
      }
    });
  }

  return (
    <div className="rounded-md border border-card-border bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Batch offers</h3>
        <span className="text-[11px] text-gray-500">
          {open.length === 0 ? 'No active offers' : `${open.length} open`}
        </span>
      </div>

      {open.length > 0 && (
        <ul className="mt-3 space-y-2">
          {open.map((o) => (
            <li
              key={o.id}
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-amber-900">{o.ticketTypeName}</span>
                <span className="text-[11px] text-amber-700">
                  expires {formatDelta(o.expiresAt)}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-amber-900/80">
                {o.recipientCount} invitee{o.recipientCount === 1 ? '' : 's'} racing · first click
                wins
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => doCancel(o.id)}
                  disabled={pending}
                  className="mt-2 text-[11px] font-semibold text-amber-900 underline-offset-2 hover:underline disabled:opacity-60"
                >
                  Cancel offer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <details className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
          <summary className="cursor-pointer select-none font-medium">
            Past offers ({history.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {history.map((o) => (
              <li key={o.id} className="flex items-center justify-between">
                <span>
                  {o.ticketTypeName}
                  {o.claimedByName ? ` · won by ${o.claimedByName}` : ''}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-gray-400">
                  {o.status}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function formatDelta(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}
