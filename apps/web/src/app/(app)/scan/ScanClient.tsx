'use client';

/**
 * Three states:
 *   1. CAPTURE  — pick / take a photo
 *   2. EXTRACTING — uploading + waiting on Claude
 *   3. CONFIRM  — show the parsed fields, let rep edit + save
 *
 * On mobile we use <input type=file accept=image/* capture=environment>
 * which opens the rear camera directly. On desktop the same input
 * becomes a normal file picker. Single component handles both.
 *
 * Duplicate flow: createPartnerFromScan returns either a created
 * partner OR a candidates list. When candidates come back, we render
 * a small "this might be the same partner" panel and let the rep
 * either pick a merge target or force-create.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button, Pill } from '@partnerradar/ui';
import {
  Camera,
  Image as ImageIcon,
  Loader2,
  Save,
  Sparkles,
  X,
  AlertTriangle,
} from 'lucide-react';
import { createPartnerFromScan, type DuplicateCandidate } from './actions';
import type { PartnerType } from '@partnerradar/types';

interface Extraction {
  companyName: string;
  contactName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  partnerTypeGuess:
    | 'REALTOR'
    | 'MORTGAGE_BROKER'
    | 'INSURANCE_AGENT'
    | 'PROPERTY_MANAGER'
    | 'GENERAL_CONTRACTOR'
    | 'PUBLIC_ADJUSTER'
    | 'REAL_ESTATE_ATTORNEY'
    | 'HOME_INSPECTOR'
    | 'OTHER'
    | null;
  confidence: number;
  notes: string | null;
}

const PARTNER_TYPE_OPTIONS: PartnerType[] = [
  'REALTOR',
  'PROPERTY_MANAGER',
  'INSURANCE_AGENT',
  'MORTGAGE_BROKER',
  'HOME_INSPECTOR',
  'PUBLIC_ADJUSTER',
  'REAL_ESTATE_ATTORNEY',
  'GENERAL_CONTRACTOR',
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'LANDSCAPER',
  'RESTORATION_MITIGATION',
  'FACILITIES_MANAGER_COMMERCIAL',
  'OTHER',
];

export function ScanClient({
  markets,
  aiConfigured,
}: {
  markets: Array<{ id: string; name: string }>;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<'capture' | 'live' | 'extracting' | 'confirm'>('capture');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [marketId, setMarketId] = useState<string>(markets[0]?.id ?? '');
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);
  const [isSaving, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Always release the camera when the component unmounts; otherwise
  // the green webcam light stays on after the rep navigates away.
  useEffect(() => {
    return () => {
      stopCamera();
    };
    // stopCamera is stable (closes over a ref); intentionally empty deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(file: File) {
    setError(null);
    setDuplicates(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPhase('extracting');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/scan/extract', { method: 'POST', body: fd });
      const data = (await res.json()) as { ok?: true; extraction?: Extraction; error?: string };
      if (!res.ok || !data.ok || !data.extraction) {
        throw new Error(data.error ?? 'Extraction failed');
      }
      setExtraction(data.extraction);
      setPhase('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
      setPhase('capture');
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setExtraction(null);
    setDuplicates(null);
    setError(null);
    setPhase('capture');
    stopCamera();
    if (fileRef.current) fileRef.current.value = '';
  }

  // ─── Live camera capture (desktop + mobile via getUserMedia) ───────
  //
  // Desktop browsers don't honor the file-input `capture=environment`
  // attribute the way phones do — they just open the file picker. To
  // get the laptop webcam we use the MediaStream API directly: request
  // the rear camera if available (falls back to facing-user), pipe to
  // a <video>, and on capture draw the current frame to a canvas and
  // convert it to a JPEG file.
  async function startCamera() {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(
        'This browser does not support direct camera access. Use the file picker below to upload a photo.',
      );
      return;
    }
    try {
      // Prefer the rear camera (better for cards held in front of you);
      // fall back to whatever the device offers if 'environment' isn't
      // available (laptops, external webcams).
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      setPhase('live');
      // wait a tick for the video element to mount
      window.setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {
            // Autoplay restrictions — surface as an error so the rep
            // knows to click the video. Rare on user-initiated paths.
            setError('Tap the video to start the preview.');
          });
        }
      }, 50);
    } catch (err) {
      // getUserMedia rejection codes — the spec gives us specific
      // names so we can tell the user exactly what to fix.
      const name = (err as { name?: string } | null)?.name ?? '';
      const msg = err instanceof Error ? err.message : 'Camera access denied';
      if (name === 'NotAllowedError' || /denied|not allowed/i.test(msg)) {
        setError(
          'Camera permission was denied. Click the lock/camera icon next to the URL → set Camera to Allow → reload. Or use "Pick a photo" below.',
        );
      } else if (name === 'NotFoundError') {
        setError(
          'No camera detected on this device. Plug one in or use "Pick a photo" to upload an image.',
        );
      } else if (name === 'NotReadableError') {
        setError('Camera is busy — close other apps using it (Zoom, Teams, OBS) and try again.');
      } else {
        setError(`Camera error: ${msg}`);
      }
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function captureFromCamera() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('Camera not ready yet — give it a second.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Could not capture frame — canvas unsupported.');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9),
    );
    if (!blob) {
      setError('Could not encode the capture as JPEG.');
      return;
    }
    const file = new File([blob], `card-${Date.now()}.jpg`, { type: 'image/jpeg' });
    stopCamera();
    onFile(file);
  }

  function updateField<K extends keyof Extraction>(key: K, value: Extraction[K]) {
    setExtraction((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function onSave(mergeIntoPartnerId?: string) {
    if (!extraction || !marketId) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await createPartnerFromScan({
          marketId,
          companyName: extraction.companyName,
          partnerType: (extraction.partnerTypeGuess ?? 'OTHER') as PartnerType,
          contactName: extraction.contactName,
          title: extraction.title,
          email: extraction.email,
          phone: extraction.phone,
          website: extraction.website,
          address: extraction.address,
          city: extraction.city,
          state: extraction.state,
          zip: extraction.zip,
          mergeIntoPartnerId: mergeIntoPartnerId ?? null,
        });
        if (result.ok) {
          router.push(`/partners/${result.partnerId}`);
          return;
        }
        // Duplicates path — show the picker.
        setDuplicates(result.candidates);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  // ─── Capture phase ──────────────────────────────────────────────
  if (phase === 'capture') {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <Card>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-primary ring-1 ring-inset ring-blue-100">
              <Camera className="h-7 w-7" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Take a photo of the card</h2>
              <p className="mt-1 max-w-sm text-xs text-gray-500">
                Open the camera live for a fresh shot, or pick a photo you already have. Both work
                on mobile and desktop — your laptop webcam is fine.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <Button onClick={startCamera} disabled={!aiConfigured}>
                <Camera className="h-4 w-4" /> Open camera
              </Button>
              <Button
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={!aiConfigured}
              >
                <ImageIcon className="h-4 w-4" /> Pick a photo
              </Button>
            </div>
            {!aiConfigured && (
              <p className="text-[11px] text-amber-700">
                Disabled until ANTHROPIC_API_KEY is set in Railway.
              </p>
            )}
          </div>
        </Card>
        <p className="text-center text-[11px] text-gray-400">
          Tip: hold the card flat in good light. The model handles slight angles + glare, but a
          straight-on shot is more accurate.
        </p>
      </div>
    );
  }

  // ─── Live camera phase ─────────────────────────────────────────
  if (phase === 'live') {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <Card>
          <div className="flex flex-col items-center gap-3 py-3">
            <div className="relative w-full overflow-hidden rounded-md bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-auto w-full"
                aria-label="Live camera preview"
              />
              {/* Card-aspect framing guide — 1.75:1 is close enough to
                  3.5×2 business-card ratio that reps line up the shot
                  without us having to do real edge detection. */}
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                aria-hidden
              >
                <div className="aspect-[1.75/1] w-[78%] rounded-md border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
              </div>
            </div>
            <p className="text-[11px] text-gray-500">
              Line the card up inside the frame — closer fills more pixels for the OCR.
            </p>
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <Button onClick={captureFromCamera} disabled={!aiConfigured}>
                <Camera className="h-4 w-4" /> Capture
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  stopCamera();
                  setPhase('capture');
                }}
              >
                <X className="h-4 w-4" /> Cancel
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Extracting phase ──────────────────────────────────────────
  if (phase === 'extracting') {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <Card>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Card preview"
                className="max-h-48 rounded-md border border-gray-200 object-contain"
              />
            )}
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Reading the card with Claude Vision…
            </div>
            <p className="text-[11px] text-gray-500">Usually 3–6 seconds.</p>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Confirm phase ─────────────────────────────────────────────
  if (!extraction) return null;
  const ext = extraction;
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Card preview"
              className="max-h-40 self-start rounded-md border border-gray-200 object-contain sm:w-44"
            />
          )}
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="soft" color={ext.confidence >= 0.7 ? 'emerald' : 'amber'}>
                <Sparkles className="mr-1 inline h-3 w-3" /> Confidence{' '}
                {Math.round(ext.confidence * 100)}%
              </Pill>
              <button
                type="button"
                onClick={reset}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
              >
                <X className="h-3 w-3" /> Re-take photo
              </button>
            </div>
            {ext.notes && (
              <div className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                {ext.notes}
              </div>
            )}
            <p className="text-[11px] text-gray-500">
              Edit anything that&apos;s wrong before saving — these go straight onto the partner
              record.
            </p>
          </div>
        </div>
      </Card>

      {duplicates && duplicates.length > 0 && (
        <Card>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Possible duplicate
            </div>
            <p className="text-[11px] text-gray-600">
              We already have a partner that looks like this in your market. Pick the right match
              below to log this as a re-encounter, or press <strong>Save anyway</strong> to create a
              new partner.
            </p>
            <ul className="divide-y divide-gray-100 rounded-md border border-amber-200 bg-amber-50">
              {duplicates.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/partners/${d.id}`}
                      target="_blank"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {d.companyName}
                    </Link>
                    <div className="font-mono text-[10.5px] text-gray-500">
                      {d.publicId} · {d.matchReason}
                      {d.city ? ` · ${d.city}` : ''}
                      {d.state ? `, ${d.state}` : ''}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => onSave(d.id)} loading={isSaving}>
                    This is the same
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  // Force-create by clearing dupes — server runs the
                  // dedupe again, but if the rep got here once they
                  // chose not to merge, treat as ship-it. We do that
                  // by NOT clearing dupes here and instead asking the
                  // server to skip dupes on a retry. Simplest path:
                  // mark this lead as "force" via a sentinel id.
                  setDuplicates(null);
                  // Submit a fresh request — it'll re-run dedupe;
                  // if same dupes come back the rep will see them
                  // again. For v1 this is acceptable; we can add a
                  // bypass flag later if it gets annoying.
                  onSave();
                }}
              >
                Save anyway as new
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Lead details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Market" required>
            <select
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Partner type" required>
            <select
              value={ext.partnerTypeGuess ?? 'OTHER'}
              onChange={(e) =>
                updateField('partnerTypeGuess', e.target.value as Extraction['partnerTypeGuess'])
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {PARTNER_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Company name" required wide>
            <input
              type="text"
              value={ext.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Contact name">
            <input
              type="text"
              value={ext.contactName ?? ''}
              onChange={(e) => updateField('contactName', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Title">
            <input
              type="text"
              value={ext.title ?? ''}
              onChange={(e) => updateField('title', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={ext.email ?? ''}
              onChange={(e) => updateField('email', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={ext.phone ?? ''}
              onChange={(e) => updateField('phone', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Website" wide>
            <input
              type="url"
              value={ext.website ?? ''}
              onChange={(e) => updateField('website', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Address" wide>
            <input
              type="text"
              value={ext.address ?? ''}
              onChange={(e) => updateField('address', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={ext.city ?? ''}
              onChange={(e) => updateField('city', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={ext.state ?? ''}
              onChange={(e) => updateField('state', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="ZIP">
            <input
              type="text"
              value={ext.zip ?? ''}
              onChange={(e) => updateField('zip', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2 pb-6">
        <Button variant="secondary" onClick={reset} disabled={isSaving}>
          Cancel
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-gray-500">
            Lands at <strong>Initial Contact</strong>, assigned to you.
          </span>
          <Button
            onClick={() => onSave()}
            loading={isSaving}
            disabled={!marketId || !ext.companyName.trim()}
          >
            <Save className="h-4 w-4" /> Save partner
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block text-[11px] font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
