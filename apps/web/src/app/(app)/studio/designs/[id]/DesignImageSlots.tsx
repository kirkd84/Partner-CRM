'use client';

/**
 * Per-slot image picker. Each image slot the template declares becomes
 * a card with an upload button + thumbnail + remove. Files are
 * compressed to a JPEG data URL client-side before posting so the
 * payload to updateDesignSlots stays bounded (max ~250KB at 1200px).
 *
 * No R2 needed — the data URL lives directly inside MwDesign.document.
 * When R2 keys arrive in MW-3 follow-ups we'll swap the storage layer
 * without touching this UI.
 */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImageIcon, Upload, X, Loader2 } from 'lucide-react';
import { updateDesignSlots } from '../actions';

interface SlotSpec {
  key: string;
  kind: 'text' | 'image' | 'color';
  label: string;
  required: boolean;
}

interface Props {
  designId: string;
  imageSlots: SlotSpec[];
  values: Record<string, string>;
}

export function DesignImageSlots({ designId, imageSlots, values }: Props) {
  if (imageSlots.length === 0) return null;
  return (
    <div className="rounded-xl border border-card-border bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">Photos</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {imageSlots.map((s) => (
          <ImageSlotCard
            key={s.key}
            designId={designId}
            slotKey={s.key}
            label={s.label}
            currentValue={values[s.key]}
          />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-gray-400">
        Photos are compressed to ~1200px before upload. JPEG, PNG, or WEBP up to ~5MB.
      </p>
    </div>
  );
}

function ImageSlotCard({
  designId,
  slotKey,
  label,
  currentValue,
}: {
  designId: string;
  slotKey: string;
  label: string;
  currentValue?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // reset input so picking the same file again triggers change
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setErr('That file is huge — pick something under 8MB.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const compressed = await compressToJpegDataUrl(f, 1200, 0.82);
      startTransition(async () => {
        try {
          await updateDesignSlots(designId, { image: { [slotKey]: compressed } });
          router.refresh();
        } catch (saveErr) {
          setErr(saveErr instanceof Error ? saveErr.message : 'Failed to save photo');
        } finally {
          setBusy(false);
        }
      });
    } catch (compErr) {
      console.warn('[image-upload] compress failed', compErr);
      setErr('Could not read that image. Try a JPEG or PNG.');
      setBusy(false);
    }
  }

  function onClear() {
    setBusy(true);
    startTransition(async () => {
      try {
        await updateDesignSlots(designId, { image: { [slotKey]: null } });
        router.refresh();
      } catch (clearErr) {
        setErr(clearErr instanceof Error ? clearErr.message : 'Failed to clear');
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-600">
        <span className="truncate">{label}</span>
        {currentValue && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            aria-label={`Remove ${label}`}
            className="text-gray-400 transition hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 transition hover:border-primary"
      >
        {currentValue ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentValue} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[11px] text-gray-500">
            <ImageIcon className="h-5 w-5" />
            <span>Tap to upload</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-primary">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {currentValue && !busy && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
            <Upload className="h-3 w-3" />
            Replace
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onPick}
      />
      {err && <p className="text-[11px] text-red-600">{err}</p>}
    </div>
  );
}

/**
 * Resize + recompress in the browser before sending to the server.
 * Keeps the data URL bounded and works on phones where uploading the
 * raw file is wasteful and slow.
 */
async function compressToJpegDataUrl(file: File, maxDim: number, quality: number): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-2d-unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

function readFileAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('read-failed'));
    r.readAsDataURL(f);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-decode-failed'));
    img.src = src;
  });
}
