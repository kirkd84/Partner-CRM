'use client';

/**
 * Per-recipient deliverability table for a newsletter.
 *
 * Each row carries the partner + email + status timestamps. The
 * "status" column distills the lifecycle into one badge: clicked >
 * opened > delivered > sent > bounced > error > skipped > pending.
 * Filter chips at the top let the manager focus on the bucket that
 * matters when debugging ("show me everyone who bounced").
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Pill } from '@partnerradar/ui';
import { Filter } from 'lucide-react';

interface Recipient {
  id: string;
  email: string;
  partner: { id: string; companyName: string };
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  firstClickedAt: string | null;
  bouncedAt: string | null;
  bounceReason: string | null;
  errorMessage: string | null;
}

type Bucket = 'all' | 'clicked' | 'opened' | 'delivered' | 'sent' | 'bounced' | 'error' | 'pending';

function classify(r: Recipient): Bucket {
  if (r.firstClickedAt) return 'clicked';
  if (r.openedAt) return 'opened';
  if (r.bouncedAt) return 'bounced';
  if (r.errorMessage) return 'error';
  if (r.deliveredAt) return 'delivered';
  if (r.sentAt) return 'sent';
  return 'pending';
}

const BUCKET_COLORS: Record<Exclude<Bucket, 'all'>, string> = {
  clicked: 'violet',
  opened: 'blue',
  delivered: 'emerald',
  sent: 'gray',
  bounced: 'red',
  error: 'red',
  pending: 'amber',
};

const BUCKETS: Array<{ id: Bucket; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'clicked', label: 'Clicked' },
  { id: 'opened', label: 'Opened' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'sent', label: 'Sent' },
  { id: 'bounced', label: 'Bounced' },
  { id: 'error', label: 'Errors' },
  { id: 'pending', label: 'Pending' },
];

export function RecipientTable({ recipients }: { recipients: Recipient[] }) {
  const [bucket, setBucket] = useState<Bucket>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of recipients) {
      const b = classify(r);
      c[b] = (c[b] ?? 0) + 1;
    }
    return c;
  }, [recipients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipients.filter((r) => {
      if (bucket !== 'all' && classify(r) !== bucket) return false;
      if (!q) return true;
      return r.email.toLowerCase().includes(q) || r.partner.companyName.toLowerCase().includes(q);
    });
  }, [recipients, bucket, query]);

  return (
    <div className="rounded-lg border border-card-border bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
        <Filter className="h-3.5 w-3.5 text-gray-400" />
        {BUCKETS.map((b) => {
          const n = b.id === 'all' ? recipients.length : (counts[b.id] ?? 0);
          const active = bucket === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBucket(b.id)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                active ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {b.label}
              <span className={active ? 'opacity-80' : 'text-gray-400'}>· {n}</span>
            </button>
          );
        })}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company or email…"
          className="ml-auto rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-label text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Partner</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Sent</th>
              <th className="px-3 py-2 text-left">Opened</th>
              <th className="px-3 py-2 text-left">Clicked</th>
              <th className="px-3 py-2 text-left">Issue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => {
              const b = classify(r);
              return (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2 font-medium text-gray-900">
                    <Link
                      href={`/partners/${r.partner.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {r.partner.companyName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.email}</td>
                  <td className="px-3 py-2">
                    {b !== 'all' && (
                      <Pill tone="soft" color={BUCKET_COLORS[b]}>
                        {b}
                      </Pill>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-gray-500">
                    {r.sentAt ? formatTime(r.sentAt) : '—'}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-gray-500">
                    {r.openedAt ? formatTime(r.openedAt) : '—'}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-gray-500">
                    {r.firstClickedAt ? formatTime(r.firstClickedAt) : '—'}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-red-700">
                    {r.bounceReason ?? r.errorMessage ?? ''}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-xs text-gray-500">
                  No recipients match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
