'use client';

/**
 * MW-5: multi-channel size picker. Lists every platform size in the
 * shared catalog grouped by channel. Picking one renders the design
 * at that size via the PNG route's ?sizeKey override and also writes
 * an MwExport row so we have a paper trail.
 *
 * Designed for the user who has one approved flyer and needs the same
 * art at IG, LinkedIn, Twitter, and email-header sizes — one tap each.
 */

import { useState, useTransition } from 'react';
import { Download, Layout, Loader2, Check } from 'lucide-react';
import { recordDesignExport } from '../actions';

interface PlatformSizeRow {
  key: string;
  label: string;
  description: string;
  width: number;
  height: number;
  group: string;
}

const GROUP_LABELS: Record<string, string> = {
  social: 'Social',
  print: 'Print',
  'business-card': 'Business cards',
  email: 'Email',
  web: 'Web',
};

const GROUP_ORDER = ['social', 'print', 'business-card', 'email', 'web'];

export function DesignSizes({
  designId,
  sizes,
  variant,
}: {
  designId: string;
  sizes: PlatformSizeRow[];
  variant: 'light' | 'dark' | 'brand-primary';
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const grouped: Record<string, PlatformSizeRow[]> = {};
  for (const s of sizes) {
    (grouped[s.group] ??= []).push(s);
  }
  const orderedGroups = GROUP_ORDER.filter((g) => grouped[g]?.length);

  function pngHref(sizeKey: string) {
    return `/api/studio/designs/${designId}/png?variant=${variant}&sizeKey=${sizeKey}`;
  }

  function onLog(sizeKey: string) {
    setBusyKey(sizeKey);
    startTransition(async () => {
      try {
        await recordDesignExport(designId, { sizeKey });
      } catch (err) {
        console.warn('[sizes] export-log failed', err);
      } finally {
        setBusyKey(null);
      }
    });
  }

  return (
    <div className="rounded-xl border border-card-border bg-white p-4">
      <div className="flex items-center gap-2">
        <Layout className="h-3.5 w-3.5 text-gray-500" />
        <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
          Export sizes
        </div>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        Render and download this design at any platform size.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {orderedGroups.map((g) => (
          <div key={g}>
            <div className="text-[10px] font-semibold uppercase tracking-label text-gray-400">
              {GROUP_LABELS[g] ?? g}
            </div>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {grouped[g]!.map((s) => (
                <a
                  key={s.key}
                  href={pngHref(s.key)}
                  target="_blank"
                  rel="noreferrer noopener"
                  download
                  onClick={() => onLog(s.key)}
                  className="group flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-left transition hover:border-primary"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-gray-900">
                      {s.label}
                    </div>
                    <div className="truncate text-[10px] text-gray-500">
                      {s.description} · {s.width}×{s.height}
                    </div>
                  </div>
                  {busyKey === s.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <Download className="h-3.5 w-3.5 text-gray-400 group-hover:text-primary" />
                  )}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-400">
        <Check className="h-3 w-3" />
        Sizes outside the template's natural aspect still render — they may need a quick crop.
      </p>
    </div>
  );
}
