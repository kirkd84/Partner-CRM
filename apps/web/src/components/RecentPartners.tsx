'use client';

/**
 * Recent partners — dropdown in the top nav.
 *
 * Persistence: localStorage key `pr-recent-partners`. We don't have a
 * server-side RecentlyViewed table; for a single-rep workstation this
 * is fine and avoids a roundtrip on every nav render.
 *
 * Tracking: the partner detail page renders <TrackPartnerView /> which
 * pushes (id, publicId, companyName) onto the front of the list,
 * deduped by id, capped at 12. The dropdown reads that list.
 *
 * Why not a Zustand / context store: we only need to read in the nav
 * and write on partner detail. localStorage is the simplest source of
 * truth that survives a hard reload (which a context wouldn't).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, ChevronDown } from 'lucide-react';

const KEY = 'pr-recent-partners';
const MAX = 12;

export interface RecentPartner {
  id: string;
  publicId: string;
  companyName: string;
  /** epoch ms; pushed at view time so we can render "5m ago". */
  at: number;
}

function readList(): RecentPartner[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPartner[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && typeof p.id === 'string' && typeof p.companyName === 'string');
  } catch {
    return [];
  }
}

function writeList(list: RecentPartner[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Quota exceeded / private browsing — silently no-op rather than crash.
  }
}

/**
 * Push a partner onto the recent-list. Call from the partner detail
 * page (client side) when it mounts. Idempotent — re-rendering the
 * same partner just bumps it to the top.
 */
export function recordPartnerView(p: Omit<RecentPartner, 'at'>): void {
  const list = readList();
  const next = [{ ...p, at: Date.now() }, ...list.filter((x) => x.id !== p.id)].slice(0, MAX);
  writeList(next);
  // Notify other tabs / the dropdown in this tab.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pr-recent-partners-changed'));
  }
}

/**
 * Dropdown trigger + panel for the top nav. Hover-controlled to match
 * the user-menu pattern next to it.
 */
export function RecentPartnersDropdown({ active }: { active: boolean }) {
  const [list, setList] = useState<RecentPartner[]>([]);

  useEffect(() => {
    setList(readList());
    const onChange = () => setList(readList());
    window.addEventListener('pr-recent-partners-changed', onChange);
    // Also catch storage events from other tabs.
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) setList(readList());
    });
    return () => {
      window.removeEventListener('pr-recent-partners-changed', onChange);
    };
  }, []);

  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        className={
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors sm:px-2.5 ' +
          (active
            ? 'bg-nav-active text-white shadow-sm'
            : 'text-white/85 hover:bg-white/10 hover:text-white')
        }
      >
        <Clock className="h-4 w-4" />
        <span className="hidden md:inline">Recent</span>
        <ChevronDown className="hidden h-3 w-3 opacity-70 md:block" />
      </button>
      <div className="invisible absolute left-0 top-full z-50 pt-1 opacity-0 transition group-hover:visible group-hover:opacity-100">
        <div role="menu" className="w-64 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
            Recently viewed
          </div>
          {list.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-500">
              Open a partner to start building this list.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {list.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/partners/${p.id}`}
                    className="block px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
                  >
                    <span className="block truncate font-medium">{p.companyName}</span>
                    <span className="block font-mono text-[10.5px] text-gray-400">
                      {p.publicId} · {humanizeAgo(p.at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Mounted on the partner detail page. Records the view so the Recent
 * dropdown picks it up. Renders nothing.
 */
export function TrackPartnerView({
  id,
  publicId,
  companyName,
}: {
  id: string;
  publicId: string;
  companyName: string;
}) {
  useEffect(() => {
    recordPartnerView({ id, publicId, companyName });
  }, [id, publicId, companyName]);
  return null;
}

function humanizeAgo(epoch: number): string {
  const ms = Date.now() - epoch;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
