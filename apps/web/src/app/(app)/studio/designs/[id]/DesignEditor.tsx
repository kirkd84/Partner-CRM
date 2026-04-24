'use client';

/**
 * Inline copy editor — any text slot defined by the template becomes a
 * field here. We debounce-autosave to updateDesignSlots so you can
 * tweak on a phone without a save button.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateDesignSlots } from '../actions';

interface SlotSpec {
  key: string;
  kind: 'text' | 'image' | 'color';
  label: string;
  required: boolean;
  constraints?: { maxChars?: number; aspectRatio?: string };
}

interface Props {
  designId: string;
  slots: Record<string, string>;
  templateSlots: SlotSpec[];
  initialVariant: 'light' | 'dark' | 'brand-primary';
}

export function DesignEditor({ designId, slots, templateSlots }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(slots);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const textSlots = templateSlots.filter((s) => s.kind === 'text');

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function onChange(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        try {
          await updateDesignSlots(designId, { text: { ...values, [key]: v } });
          setSavedAt(Date.now());
          router.refresh();
        } catch (err) {
          console.warn('[editor] save failed', err);
        }
      });
    }, 600);
  }

  if (textSlots.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-white p-4 text-sm text-gray-600">
        This template has no editable text slots.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-card-border bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">Copy</div>
        <div className="text-[11px] text-gray-400">
          {isPending ? 'Saving…' : savedAt ? 'Saved' : ''}
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-3">
        {textSlots.map((s) => {
          const value = values[s.key] ?? '';
          const isLong = (s.constraints?.maxChars ?? 60) > 80;
          return (
            <label key={s.key} className="block text-sm">
              <span className="text-[11px] font-medium text-gray-600">{s.label}</span>
              {isLong ? (
                <textarea
                  rows={3}
                  value={value}
                  onChange={(e) => onChange(s.key, e.target.value)}
                  maxLength={s.constraints?.maxChars}
                  className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => onChange(s.key, e.target.value)}
                  maxLength={s.constraints?.maxChars}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
