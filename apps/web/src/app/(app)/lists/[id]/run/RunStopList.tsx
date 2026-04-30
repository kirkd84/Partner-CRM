'use client';

/**
 * Phase 9: client island for the run view. Shows the next pending stop
 * as a big card with thumb-friendly buttons, plus a queue of upcoming
 * + completed stops underneath.
 *
 * Navigate buttons use platform-aware deep links — iOS gets Apple Maps
 * by default with a Google Maps fallback link; Android opens Google
 * Maps directly. Desktop opens Google Maps in a new tab.
 *
 * "Re-plan from here" requests the rep's current location and calls the
 * optimizer with that as the origin so the remaining stops re-order
 * around their actual position.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  CircleMinus,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  RefreshCcw,
  Undo2,
} from 'lucide-react';
import { markStopComplete, skipStop, optimizeHitList } from '../../actions';

interface PartnerLite {
  id: string;
  companyName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  partnerType: string;
  notes: string | null;
}

interface StopRow {
  id: string;
  order: number;
  plannedArrival: string;
  plannedDurationMin: number;
  isAppointmentLock: boolean;
  /** v2 multi-day planner: leg distance + drive time + ETA. */
  distanceFromPrevMi: number | null;
  durationFromPrevMin: number | null;
  arrivalEta: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  skipReason: string | null;
  partner: PartnerLite;
}

export function RunStopList({ listId, stops }: { listId: string; stops: StopRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [skipFor, setSkipFor] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [replanning, setReplanning] = useState(false);
  const [replanMsg, setReplanMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const next = stops.find((s) => !s.completedAt && !s.skippedAt) ?? null;
  const upcoming = stops.filter((s) => s !== next && !s.completedAt && !s.skippedAt);
  const done = stops.filter((s) => s.completedAt || s.skippedAt);

  function onComplete(stopId: string) {
    setBusyId(stopId);
    startTransition(async () => {
      try {
        await markStopComplete(stopId);
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  function onSkipSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!skipFor) return;
    const id = skipFor;
    setBusyId(id);
    startTransition(async () => {
      try {
        await skipStop(id, skipReason || undefined);
        setSkipFor(null);
        setSkipReason('');
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  function onUndo(stopId: string) {
    setBusyId(stopId);
    startTransition(async () => {
      try {
        // markStopComplete is a toggle when the stop is already completed,
        // and skipStop is a toggle when already skipped. We try the matching
        // toggle based on which flag is set.
        const stop = stops.find((s) => s.id === stopId);
        if (stop?.completedAt) await markStopComplete(stopId);
        else if (stop?.skippedAt) await skipStop(stopId);
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  function onReplan() {
    if (!('geolocation' in navigator)) {
      setReplanMsg('Geolocation not supported on this device.');
      return;
    }
    setReplanning(true);
    setReplanMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startTransition(async () => {
          try {
            const result = await optimizeHitList(listId, {
              startLat: pos.coords.latitude,
              startLng: pos.coords.longitude,
              startedAt: new Date().toISOString(),
            });
            if (result.ok) {
              setReplanMsg(
                `Re-planned via ${result.provider === 'google-directions' ? 'Google Directions' : 'distance heuristic'} — ${result.totalDistance} mi`,
              );
              router.refresh();
            } else {
              setReplanMsg('Nothing to re-plan — no remaining stops.');
            }
          } catch (err) {
            setReplanMsg(err instanceof Error ? err.message : 'Re-plan failed');
          } finally {
            setReplanning(false);
          }
        });
      },
      (err) => {
        setReplanning(false);
        setReplanMsg(`Location request denied (${err.message}).`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 pb-24 sm:p-6">
      {next ? (
        <NextStopCard
          stop={next}
          busy={busyId === next.id}
          onComplete={() => onComplete(next.id)}
          onSkip={() => {
            setSkipFor(next.id);
            setSkipReason('');
          }}
        />
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <h2 className="mt-3 text-base font-semibold text-emerald-900">All stops handled.</h2>
          <p className="mt-1 text-sm text-emerald-800">
            {done.length} stop{done.length === 1 ? '' : 's'} closed out — nice work.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onReplan}
          disabled={replanning || upcoming.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {replanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          Re-plan from here
        </button>
        {replanMsg && <span className="text-[11px] text-gray-500">{replanMsg}</span>}
      </div>

      {upcoming.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
            Upcoming
          </h3>
          <ol className="mt-2 flex flex-col gap-2">
            {upcoming.map((s) => (
              <UpcomingRow
                key={s.id}
                stop={s}
                busy={busyId === s.id}
                onComplete={() => onComplete(s.id)}
                onSkip={() => {
                  setSkipFor(s.id);
                  setSkipReason('');
                }}
              />
            ))}
          </ol>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-label text-gray-500">Done</h3>
          <ol className="mt-2 flex flex-col gap-2">
            {done.map((s) => (
              <DoneRow key={s.id} stop={s} busy={busyId === s.id} onUndo={() => onUndo(s.id)} />
            ))}
          </ol>
        </section>
      )}

      {/* Skip-with-reason sheet */}
      {skipFor && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={onSkipSubmit}
            className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
          >
            <h2 className="text-base font-semibold text-gray-900">Skip this stop?</h2>
            <p className="mt-1 text-xs text-gray-500">
              We&apos;ll log it on the partner so you have a record.
            </p>
            <input
              autoFocus
              type="text"
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="Reason (optional) — e.g. closed, ran out of time"
              className="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSkipFor(null);
                  setSkipReason('');
                }}
                className="rounded-md px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === skipFor}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:opacity-60"
              >
                {busyId === skipFor && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Skip stop
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function NextStopCard({
  stop,
  busy,
  onComplete,
  onSkip,
}: {
  stop: StopRow;
  busy: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const partner = stop.partner;
  const fullAddress = [
    partner.address,
    [partner.city, partner.state].filter(Boolean).join(', '),
    partner.zip,
  ]
    .filter(Boolean)
    .join(' ');
  const navHrefs = buildNavHrefs(partner);

  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-white shadow-sm">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-5 py-4 text-white">
        <div className="text-[11px] font-semibold uppercase tracking-label opacity-80">
          Next stop · {stop.order + 1}
        </div>
        <h2 className="mt-1 text-xl font-semibold">{partner.companyName}</h2>
        <div className="mt-1 flex items-center gap-1 text-sm opacity-90">
          <MapPin className="h-3.5 w-3.5" />
          {fullAddress || 'Address missing'}
        </div>
        <div className="mt-2 text-xs opacity-80">
          ETA {formatTime(stop.arrivalEta ?? stop.plannedArrival)} · ~{stop.plannedDurationMin} min
          visit
          {stop.isAppointmentLock && ' · locked appointment'}
        </div>
        {stop.distanceFromPrevMi != null && stop.durationFromPrevMin != null && (
          <div className="mt-0.5 text-[10.5px] opacity-70">
            {stop.distanceFromPrevMi.toFixed(1)} mi · {stop.durationFromPrevMin} min from previous
            stop
          </div>
        )}
      </div>

      {partner.notes && (
        <div className="border-b border-gray-100 px-5 py-3 text-xs text-gray-700">
          <span className="font-semibold text-gray-500">Last note:</span> {partner.notes}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 p-3">
        <a
          href={navHrefs.primary}
          target="_blank"
          rel="noreferrer noopener"
          className="flex flex-col items-center justify-center gap-1 rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
        >
          <Navigation className="h-5 w-5" />
          Navigate
        </a>
        <button
          type="button"
          onClick={onComplete}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
          Visited
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-700 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
        >
          <CircleMinus className="h-5 w-5" />
          Skip
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-2 text-[11px] text-gray-500">
        <a
          href={navHrefs.fallback}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-primary"
        >
          Google Maps
        </a>
        <span>·</span>
        <a
          href={`tel:${partner.partnerType}`}
          className="inline-flex items-center gap-1 hover:text-primary"
        >
          <Phone className="h-3 w-3" />
          Call partner
        </a>
        <span className="ml-auto">{partner.partnerType.replace(/_/g, ' ').toLowerCase()}</span>
      </div>
    </div>
  );
}

function UpcomingRow({
  stop,
  busy,
  onComplete,
  onSkip,
}: {
  stop: StopRow;
  busy: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <span className="font-mono text-[11px] text-gray-400">#{stop.order + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-900">
          {stop.partner.companyName}
        </div>
        <div className="truncate text-[11px] text-gray-500">
          {stop.partner.address}
          {stop.partner.city ? `, ${stop.partner.city}` : ''} · ETA{' '}
          {formatTime(stop.arrivalEta ?? stop.plannedArrival)}
          {stop.distanceFromPrevMi != null ? ` · ${stop.distanceFromPrevMi.toFixed(1)} mi` : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={onComplete}
        disabled={busy}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
        aria-label="Mark visited"
      >
        <CheckCircle2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSkip}
        disabled={busy}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
        aria-label="Skip"
      >
        <CircleMinus className="h-4 w-4" />
      </button>
    </li>
  );
}

function DoneRow({ stop, busy, onUndo }: { stop: StopRow; busy: boolean; onUndo: () => void }) {
  const completed = Boolean(stop.completedAt);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      {completed ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : (
        <CircleMinus className="h-4 w-4 text-gray-400" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{stop.partner.companyName}</div>
        <div className="truncate text-[11px] text-gray-500">
          {completed
            ? `Visited ${formatTime(stop.completedAt!)}`
            : `Skipped${stop.skipReason ? ` — ${stop.skipReason}` : ''}`}
        </div>
      </div>
      <button
        type="button"
        onClick={onUndo}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-gray-600 hover:bg-white hover:text-primary disabled:opacity-50"
      >
        <Undo2 className="h-3 w-3" />
        Undo
      </button>
    </li>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function buildNavHrefs(p: PartnerLite): { primary: string; fallback: string } {
  const queryParts = [p.address, p.city, p.state, p.zip].filter(Boolean).join(' ');
  const q = encodeURIComponent(queryParts || p.companyName);
  const isiOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent || '') &&
    !(window as unknown as { MSStream?: unknown }).MSStream;
  const primary = isiOS
    ? `maps://?daddr=${q}` // Apple Maps
    : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  const fallback = `https://www.google.com/maps/search/?api=1&query=${q}`;
  return { primary, fallback };
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '—';
  }
}
