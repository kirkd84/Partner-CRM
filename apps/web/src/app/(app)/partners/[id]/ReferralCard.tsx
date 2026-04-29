'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button, Pill } from '@partnerradar/ui';
import { Search, X, ArrowRight, Users } from 'lucide-react';
import { setReferredBy } from './actions';

interface SearchResult {
  id: string;
  publicId: string;
  companyName: string;
  city: string | null;
  state: string | null;
}

export function ReferralCard({
  partnerId,
  canEdit,
  referredBy,
  referredPartners,
}: {
  partnerId: string;
  canEdit: boolean;
  referredBy: { id: string; publicId: string; companyName: string } | null;
  referredPartners: Array<{ id: string; publicId: string; companyName: string; stage: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function search(q: string) {
    setQuery(q);
    setError(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const r = await fetch(
        `/api/partners/search?q=${encodeURIComponent(q.trim())}&excludeId=${partnerId}`,
      );
      if (!r.ok) {
        setResults([]);
        return;
      }
      const data = (await r.json()) as { results?: SearchResult[] };
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    }
  }

  function pick(target: SearchResult | null) {
    setError(null);
    startTransition(async () => {
      try {
        await setReferredBy(partnerId, target?.id ?? null);
        setEditing(false);
        setQuery('');
        setResults([]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update');
      }
    });
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-500" />
          Referrals
        </span>
      }
    >
      {error && (
        <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          {error}
        </div>
      )}

      {/* Who referred this partner */}
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
          Referred by
        </div>
        {referredBy && !editing ? (
          <div className="mt-1 flex items-center gap-2">
            <Link
              href={`/partners/${referredBy.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {referredBy.companyName}
            </Link>
            <span className="font-mono text-[10.5px] text-gray-400">{referredBy.publicId}</span>
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="ml-auto text-[10.5px] text-gray-500 hover:text-primary"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => pick(null)}
                  className="text-[10.5px] text-gray-400 hover:text-red-600"
                  aria-label="Clear referral"
                  title="Clear"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        ) : !editing ? (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-gray-500">No referral source recorded.</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="ml-auto text-[10.5px] text-primary hover:underline"
              >
                Add
              </button>
            )}
          </div>
        ) : (
          <div className="mt-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder="Type a partner name…"
                className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-7 pr-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            {results.length > 0 && (
              <ul className="mt-1 max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => pick(r)}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="flex-1 truncate">{r.companyName}</span>
                      <span className="font-mono text-[10.5px] text-gray-400">{r.publicId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setQuery('');
                  setResults([]);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Partners they referred (the outgoing list) */}
      {referredPartners.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
              Referred to us
            </span>
            <Pill tone="soft" color="emerald">
              {referredPartners.length}
            </Pill>
          </div>
          <ul className="divide-y divide-gray-100">
            {referredPartners.slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1 text-sm">
                <Link
                  href={`/partners/${p.id}`}
                  className="flex-1 truncate font-medium text-gray-900 hover:text-primary"
                >
                  {p.companyName}
                </Link>
                <span className="font-mono text-[10.5px] text-gray-400">{p.publicId}</span>
                <Pill tone="soft" color="gray">
                  {p.stage.replace(/_/g, ' ').toLowerCase()}
                </Pill>
              </li>
            ))}
          </ul>
          {referredPartners.length > 8 && (
            <Link
              href={`/partners?referredById=${partnerId}`}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              See all {referredPartners.length} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
