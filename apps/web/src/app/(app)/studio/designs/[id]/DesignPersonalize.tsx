'use client';

/**
 * MW-6: per-partner preview. Pick a partner from the user's market and
 * the preview re-renders with merge tokens resolved from that partner.
 * Tokens like {{firstName}} or {{partner.companyName}} get filled in;
 * unknown tokens are left visible so missing context is obvious.
 *
 * The picker is intentionally light — typeahead over partners visible
 * to the caller. For full bulk personalization (a list of recipients
 * with one Generate per partner) we extend this in a follow-up.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, User as UserIcon, X, ChevronDown } from 'lucide-react';

interface PartnerLite {
  id: string;
  companyName: string;
  primaryContactName: string | null;
}

interface Props {
  designId: string;
  partners: PartnerLite[];
  variant: 'light' | 'dark' | 'brand-primary';
  width: number;
  height: number;
}

export function DesignPersonalize({ designId, partners, variant, width, height }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when the user clicks outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return partners.slice(0, 24);
    return partners
      .filter(
        (p) =>
          p.companyName.toLowerCase().includes(needle) ||
          (p.primaryContactName?.toLowerCase().includes(needle) ?? false),
      )
      .slice(0, 24);
  }, [q, partners]);

  const selected = selectedId ? (partners.find((p) => p.id === selectedId) ?? null) : null;
  const previewSrc = selectedId
    ? `/api/studio/designs/${designId}/png?variant=${variant}&partnerId=${selectedId}&v=preview`
    : null;

  return (
    <div className="rounded-xl border border-card-border bg-white p-4" ref={containerRef}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserIcon className="h-3.5 w-3.5 text-gray-500" />
          <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
            Personalize for a partner
          </div>
        </div>
        {selected && (
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setQ('');
            }}
            aria-label="Clear personalization"
            className="text-gray-400 transition hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        Use tokens like <code className="rounded bg-gray-100 px-1">{'{{firstName}}'}</code> or{' '}
        <code className="rounded bg-gray-100 px-1">{'{{partner.companyName}}'}</code> in any text
        slot — pick a partner here to preview.
      </p>

      {/* Combobox */}
      <div className="relative mt-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm transition hover:border-primary"
        >
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <span className="min-w-0 flex-1 truncate">
            {selected ? selected.companyName : 'Search partners…'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter…"
              className="block w-full border-b border-gray-100 px-3 py-2 text-sm focus:outline-none"
            />
            {matches.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-500">No partners match that.</div>
            ) : (
              <ul>
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(p.id);
                        setOpen(false);
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm transition hover:bg-gray-50"
                    >
                      <span className="font-semibold text-gray-900">{p.companyName}</span>
                      {p.primaryContactName && (
                        <span className="text-[11px] text-gray-500">{p.primaryContactName}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Personalized preview thumbnail */}
      {previewSrc && (
        <div className="mt-3 overflow-hidden rounded-lg border border-card-border bg-gray-50">
          <div className="relative w-full" style={{ aspectRatio: `${width} / ${height}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt={`Preview personalized for ${selected?.companyName}`}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-2.5 py-2 text-[11px]">
            <span className="truncate text-gray-700">
              Preview for <strong>{selected?.companyName}</strong>
            </span>
            <a
              href={previewSrc}
              download={`design-${selected?.companyName ?? 'partner'}.png`}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 transition hover:border-primary hover:text-primary"
            >
              Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
