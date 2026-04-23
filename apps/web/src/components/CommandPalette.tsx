'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Building2, User, ListTodo, CornerDownLeft } from 'lucide-react';
import { globalSearch, type SearchHit } from '@/app/search/actions';

/**
 * Global Cmd/K (Ctrl/K on Windows) command palette — fuzzy search over
 * partners, contacts, and tasks in the caller's markets. Mounted once
 * in the app layout, mostly invisible until summoned.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Global shortcut: Cmd/Ctrl+K toggles, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Autofocus when opened
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
      setHits([]);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      if (query.trim().length === 0) {
        setHits([]);
        return;
      }
      startTransition(async () => {
        const res = await globalSearch(query);
        setHits(res);
        setActiveIdx(0);
      });
    }, 150);
    return () => window.clearTimeout(handle);
  }, [query, open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) pick(hit);
    }
  }

  function pick(hit: SearchHit) {
    setOpen(false);
    router.push(hit.href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-gray-900/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Search Partner Portal"
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search partners, contacts, tasks…"
            className="flex-1 border-0 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          />
          <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            Esc
          </kbd>
        </div>

        {/* Results */}
        {query.trim().length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            Start typing to search…
          </div>
        ) : isPending && hits.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">Searching…</div>
        ) : hits.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            No matches for &ldquo;{query}&rdquo;
          </div>
        ) : (
          <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
            {hits.map((h, i) => (
              <li key={`${h.kind}-${h.id}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => pick(h)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] ${
                    i === activeIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <KindIcon kind={h.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-gray-900">{h.title}</span>
                      {h.badge && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                          {h.badge}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-gray-500">{h.subtitle}</div>
                  </div>
                  {i === activeIdx && (
                    <CornerDownLeft className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2 text-[11px] text-gray-500">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 font-mono text-[10px]">
                ↑
              </kbd>{' '}
              <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 font-mono text-[10px]">
                ↓
              </kbd>{' '}
              navigate
            </span>
            <span>
              <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 font-mono text-[10px]">
                ↵
              </kbd>{' '}
              open
            </span>
          </div>
          <span>
            <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>{' '}
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: SearchHit['kind'] }) {
  const base = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset';
  if (kind === 'partner') {
    return (
      <span className={`${base} bg-blue-50 text-blue-600 ring-blue-100`}>
        <Building2 className="h-4 w-4" />
      </span>
    );
  }
  if (kind === 'contact') {
    return (
      <span className={`${base} bg-purple-50 text-purple-600 ring-purple-100`}>
        <User className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber-50 text-amber-600 ring-amber-100`}>
      <ListTodo className="h-4 w-4" />
    </span>
  );
}
