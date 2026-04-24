'use client';

/**
 * Renders the design as a responsive image. On mobile we fit to the
 * viewport width; on desktop we cap at the preview container width.
 * A cache-busting counter triggers a re-fetch after edits.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  designId: string;
  width: number;
  height: number;
  defaultVariant: 'light' | 'dark' | 'brand-primary';
}

const VARIANTS: Array<{ key: 'light' | 'dark' | 'brand-primary'; label: string; swatch: string }> =
  [
    { key: 'light', label: 'Light', swatch: '#ffffff' },
    { key: 'dark', label: 'Dark', swatch: '#1f2937' },
    { key: 'brand-primary', label: 'Brand', swatch: '#F2903A' },
  ];

export function DesignPreview({ designId, width, height, defaultVariant }: Props) {
  const [variant, setVariant] = useState<'light' | 'dark' | 'brand-primary'>(defaultVariant);
  const [bust, setBust] = useState(0);
  const [loading, setLoading] = useState(true);

  const src = `/api/studio/designs/${designId}/png?variant=${variant}&v=${bust}`;
  const aspectRatio = `${width} / ${height}`;

  return (
    <div className="overflow-hidden rounded-xl border border-card-border bg-white">
      <div
        className="relative flex items-center justify-center bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_10px,#e5e7eb_10px,#e5e7eb_20px)]"
        style={{ aspectRatio }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Design preview"
          className="h-full w-full object-contain"
          onLoadStart={() => setLoading(true)}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      </div>
      <div className="flex items-center gap-2 overflow-x-auto border-t border-gray-100 px-3 py-2 text-xs">
        <span className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
          Variant
        </span>
        {VARIANTS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => {
              setVariant(v.key);
              setBust((b) => b + 1);
            }}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 transition ${
              variant === v.key
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-gray-200 text-gray-700 hover:border-gray-300'
            }`}
          >
            <span
              className="inline-block h-3 w-3 rounded-full border border-black/10"
              style={{ backgroundColor: v.swatch }}
            />
            {v.label}
          </button>
        ))}
        <span className="ml-auto hidden text-[10px] text-gray-400 sm:inline">
          {width}×{height}
        </span>
      </div>
    </div>
  );
}
