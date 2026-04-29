'use client';

/**
 * Batch upload UX:
 *
 *   1. User drops N images on the drop-zone (or clicks to pick).
 *   2. Each image gets a "card" row with status = queued.
 *   3. We run a small concurrency-limited worker (4 at a time) that
 *      POSTs each image to /api/scan/extract. Per-row state moves
 *      through queued → extracting → extracted (or failed).
 *   4. When the rep clicks "Push to prospect queue", any extracted
 *      cards are sent to the server batch action which creates
 *      ScrapedLead rows in the existing /admin/scraped-leads queue.
 *
 * 3000-card scenarios: Claude Vision Sonnet calls are ~3-6s each; with
 * concurrency 4 that's ~25 cards/min. Reps can leave the tab open and
 * push in chunks. The page has no rate-limiter of its own — Resend /
 * Claude fail closed if quota's hit.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Pill } from '@partnerradar/ui';
import { Upload, Loader2, CheckCircle2, AlertTriangle, X, ArrowRight, Layers } from 'lucide-react';
import { batchScanToQueue, type BatchScanCard } from './actions';
import type { PartnerType } from '@partnerradar/types';

type CardStatus = 'queued' | 'extracting' | 'extracted' | 'failed' | 'pushed';

interface CardEntry {
  clientKey: string;
  fileName: string;
  fileSize: number;
  previewUrl: string;
  status: CardStatus;
  error?: string;
  // Extracted fields — populated after success
  companyName?: string;
  contactName?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  partnerTypeGuess?: string | null;
  confidence?: number | null;
  notes?: string | null;
}

const CONCURRENCY = 4;
const MAX_FILES = 100; // soft cap per submission so the worker queue stays sane

export function BatchScanClient({
  markets,
  aiConfigured,
}: {
  markets: Array<{ id: string; name: string }>;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [batchLabel, setBatchLabel] = useState('');
  const [cards, setCards] = useState<CardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPushing, startPush] = useTransition();
  const [isProcessing, setProcessing] = useState(false);

  // Stats for the side rail.
  const stats = useMemo(() => {
    const counts = { queued: 0, extracting: 0, extracted: 0, failed: 0, pushed: 0 };
    for (const c of cards) counts[c.status]++;
    return counts;
  }, [cards]);

  // Tear down preview URLs on unmount so we don't leak blob handles.
  useEffect(() => {
    return () => {
      for (const c of cards) URL.revokeObjectURL(c.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setInfo(null);
    const remaining = MAX_FILES - cards.length;
    if (remaining <= 0) {
      setError(`Drop more in a follow-up batch — current cap is ${MAX_FILES} per submission.`);
      return;
    }
    const accepted: CardEntry[] = [];
    let skipped = 0;
    for (const f of Array.from(files).slice(0, remaining)) {
      if (!f.type.startsWith('image/')) {
        skipped++;
        continue;
      }
      accepted.push({
        clientKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`,
        fileName: f.name,
        fileSize: f.size,
        previewUrl: URL.createObjectURL(f),
        status: 'queued',
      });
    }
    if (skipped > 0) setInfo(`Skipped ${skipped} non-image file(s).`);
    setCards((prev) => [...prev, ...accepted]);
    if (fileRef.current) fileRef.current.value = '';
    if (accepted.length > 0) {
      // Stash File objects in the entries so the worker can read them.
      // We do this via a Map keyed by clientKey since File can't go on
      // serialised state without a re-read. Worker pulls from this map.
      const newMap = new Map(filesByKey.current);
      accepted.forEach((c, i) => {
        const file = files.item(skipped + i);
        if (file) newMap.set(c.clientKey, file);
      });
      filesByKey.current = newMap;
      // Kick off the worker if it's not already running.
      if (!isProcessing) runWorker();
    }
  }

  // Map of clientKey → File so the worker can read the blob even after
  // the cards array is in React state. Lives outside React state to
  // avoid re-renders on every blob registration.
  const filesByKey = useRef<Map<string, File>>(new Map());

  async function runWorker() {
    setProcessing(true);
    try {
      while (true) {
        // Pull queued entries up to concurrency. We re-read state each
        // iteration so newly-dropped cards get picked up automatically.
        let nextBatch: CardEntry[] = [];
        setCards((prev) => {
          nextBatch = prev.filter((c) => c.status === 'queued').slice(0, CONCURRENCY);
          if (nextBatch.length === 0) return prev;
          // Mark this batch as extracting so it doesn't get picked up
          // again next iteration.
          const ids = new Set(nextBatch.map((c) => c.clientKey));
          return prev.map((c) =>
            ids.has(c.clientKey) ? { ...c, status: 'extracting' as CardStatus } : c,
          );
        });
        // setState is async — give React a beat to flush so the snapshot
        // we just took is in sync with the UI.
        await new Promise((r) => setTimeout(r, 10));
        if (nextBatch.length === 0) break;

        await Promise.all(
          nextBatch.map(async (entry) => {
            const file = filesByKey.current.get(entry.clientKey);
            if (!file) {
              updateCard(entry.clientKey, { status: 'failed', error: 'file unavailable' });
              return;
            }
            try {
              const fd = new FormData();
              fd.append('image', file);
              const res = await fetch('/api/scan/extract', {
                method: 'POST',
                body: fd,
              });
              const data = (await res.json()) as {
                ok?: true;
                extraction?: {
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
                  partnerTypeGuess: string | null;
                  confidence: number;
                  notes: string | null;
                };
                error?: string;
              };
              if (!res.ok || !data.ok || !data.extraction) {
                throw new Error(data.error ?? 'Extraction failed');
              }
              updateCard(entry.clientKey, {
                status: 'extracted',
                companyName: data.extraction.companyName,
                contactName: data.extraction.contactName,
                title: data.extraction.title,
                email: data.extraction.email,
                phone: data.extraction.phone,
                website: data.extraction.website,
                address: data.extraction.address,
                city: data.extraction.city,
                state: data.extraction.state,
                zip: data.extraction.zip,
                partnerTypeGuess: data.extraction.partnerTypeGuess,
                confidence: data.extraction.confidence,
                notes: data.extraction.notes,
              });
            } catch (err) {
              updateCard(entry.clientKey, {
                status: 'failed',
                error: err instanceof Error ? err.message : 'Extraction failed',
              });
            }
          }),
        );
      }
    } finally {
      setProcessing(false);
    }
  }

  function updateCard(clientKey: string, patch: Partial<CardEntry>) {
    setCards((prev) => prev.map((c) => (c.clientKey === clientKey ? { ...c, ...patch } : c)));
  }

  function removeCard(clientKey: string) {
    filesByKey.current.delete(clientKey);
    setCards((prev) => {
      const target = prev.find((c) => c.clientKey === clientKey);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((c) => c.clientKey !== clientKey);
    });
  }

  function retryCard(clientKey: string) {
    updateCard(clientKey, { status: 'queued', error: undefined });
    if (!isProcessing) runWorker();
  }

  async function pushToQueue() {
    setError(null);
    setInfo(null);
    if (!marketId) {
      setError('Pick a market for the batch.');
      return;
    }
    const ready = cards.filter((c) => c.status === 'extracted');
    if (ready.length === 0) {
      setError('No extracted cards yet. Wait for the queue to finish, or fix any failed ones.');
      return;
    }
    startPush(async () => {
      try {
        const result = await batchScanToQueue({
          marketId,
          batchLabel: batchLabel.trim() || null,
          cards: ready.map(
            (c): BatchScanCard => ({
              clientKey: c.clientKey,
              companyName: c.companyName ?? '',
              partnerType: (c.partnerTypeGuess ?? 'OTHER') as PartnerType,
              contactName: c.contactName ?? null,
              title: c.title ?? null,
              email: c.email ?? null,
              phone: c.phone ?? null,
              website: c.website ?? null,
              address: c.address ?? null,
              city: c.city ?? null,
              state: c.state ?? null,
              zip: c.zip ?? null,
              confidence: c.confidence ?? null,
              notesFromModel: c.notes ?? null,
            }),
          ),
        });
        // Mark each pushed card so the rep sees the green checkmark.
        const queued = new Set(
          result.outcomes.filter((o) => o.status === 'queued').map((o) => o.clientKey),
        );
        setCards((prev) =>
          prev.map((c) => (queued.has(c.clientKey) ? { ...c, status: 'pushed' as CardStatus } : c)),
        );
        setInfo(
          `Pushed ${result.inserted} to the prospect queue${
            result.skipped > 0 ? ` (${result.skipped} skipped)` : ''
          }. Open the queue to review and assign.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Push failed');
      }
    });
  }

  const allDone =
    cards.length > 0 &&
    cards.every((c) => c.status === 'extracted' || c.status === 'failed' || c.status === 'pushed');

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {info}
          </div>
        )}

        <Card>
          <div
            onClick={() => aiConfigured && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!aiConfigured) return;
              onPickFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center gap-2 rounded-md border-2 border-dashed py-10 text-center transition ${
              aiConfigured
                ? 'cursor-pointer border-gray-300 hover:border-primary hover:bg-blue-50/40'
                : 'cursor-not-allowed border-gray-200 opacity-60'
            }`}
          >
            <Upload className="h-7 w-7 text-gray-400" />
            <div className="text-sm font-medium text-gray-900">
              Drop card photos here, or click to pick
            </div>
            <p className="text-[11px] text-gray-500">
              Up to {MAX_FILES} per submission. Drop more in follow-up batches if needed.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onPickFiles(e.target.files)}
            />
          </div>
        </Card>

        {cards.length > 0 && (
          <Card title={`Cards (${cards.length})`}>
            <ul className="divide-y divide-gray-100">
              {cards.map((c) => (
                <li key={c.clientKey} className="flex items-start gap-3 py-2 text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.previewUrl}
                    alt={c.fileName}
                    className="h-12 w-20 flex-shrink-0 rounded border border-gray-200 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-gray-900">
                        {c.companyName ?? c.fileName}
                      </span>
                      <StatusPill status={c.status} confidence={c.confidence} />
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {c.status === 'extracted' && (
                        <>{[c.contactName, c.email, c.phone].filter(Boolean).join(' · ')}</>
                      )}
                      {c.status === 'failed' && <span className="text-red-600">{c.error}</span>}
                      {(c.status === 'queued' || c.status === 'extracting') && (
                        <span className="text-gray-500">{c.fileName}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {c.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => retryCard(c.clientKey)}
                        className="rounded p-1 text-amber-600 hover:bg-amber-50"
                        aria-label="Retry"
                      >
                        <Loader2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {c.status !== 'pushed' && (
                      <button
                        type="button"
                        onClick={() => removeCard(c.clientKey)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove card"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <aside className="space-y-3">
        <Card title="Submission">
          <label className="block">
            <span className="text-[11px] font-medium text-gray-600">
              Market <span className="text-red-500">*</span>
            </span>
            <select
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block">
            <span className="text-[11px] font-medium text-gray-600">Batch label (optional)</span>
            <input
              type="text"
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
              placeholder="BNI dinner — Apr 28"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10.5px] text-gray-400">
              Helps a manager group these by event/conference in the prospect queue.
            </p>
          </label>
        </Card>

        <Card title="Progress">
          <div className="space-y-1.5 text-xs">
            <Stat label="Queued" value={stats.queued + stats.extracting} />
            <Stat label="Extracted" value={stats.extracted} accent="emerald" />
            <Stat label="Failed" value={stats.failed} accent="red" />
            <Stat label="Pushed" value={stats.pushed} accent="blue" />
          </div>
          {isProcessing && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-blue-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reading {Math.min(CONCURRENCY, stats.extracting)} card
              {stats.extracting === 1 ? '' : 's'}…
            </div>
          )}
        </Card>

        <Card title="Send to queue">
          <Button
            onClick={pushToQueue}
            disabled={
              isPushing ||
              isProcessing ||
              cards.filter((c) => c.status === 'extracted').length === 0
            }
            loading={isPushing}
            className="w-full"
          >
            <Layers className="h-4 w-4" /> Push {stats.extracted} to prospect queue
          </Button>
          {!isProcessing && allDone && stats.failed > 0 && (
            <p className="mt-2 flex items-start gap-1 text-[11px] text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              {stats.failed} card{stats.failed === 1 ? '' : 's'} failed — retry or remove before
              pushing.
            </p>
          )}
          <Link
            href="/admin/scraped-leads"
            className="mt-3 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            Open prospect queue <ArrowRight className="h-3 w-3" />
          </Link>
          <p className="mt-2 text-[10.5px] text-gray-400">
            Pushed cards land at status PENDING with source BUSINESS_CARD. The queue&apos;s bulk
            approve + split-by-rep tooling handles routing 100s at a time.
          </p>
        </Card>
      </aside>
    </div>
  );
}

function StatusPill({ status, confidence }: { status: CardStatus; confidence?: number | null }) {
  if (status === 'queued')
    return (
      <Pill tone="soft" color="gray">
        queued
      </Pill>
    );
  if (status === 'extracting')
    return (
      <Pill tone="soft" color="blue">
        reading…
      </Pill>
    );
  if (status === 'extracted')
    return (
      <Pill tone="soft" color={confidence && confidence < 0.7 ? 'amber' : 'emerald'}>
        <CheckCircle2 className="mr-0.5 inline h-3 w-3" />
        {confidence != null ? `${Math.round(confidence * 100)}%` : 'ready'}
      </Pill>
    );
  if (status === 'failed')
    return (
      <Pill tone="soft" color="red">
        failed
      </Pill>
    );
  if (status === 'pushed')
    return (
      <Pill tone="soft" color="blue">
        pushed
      </Pill>
    );
  return null;
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'emerald' | 'red' | 'blue';
}) {
  const tone =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'red'
        ? 'text-red-700'
        : accent === 'blue'
          ? 'text-blue-700'
          : 'text-gray-900';
  return (
    <div className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-2 py-1">
      <span className="text-[10.5px] uppercase tracking-label text-gray-500">{label}</span>
      <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}
