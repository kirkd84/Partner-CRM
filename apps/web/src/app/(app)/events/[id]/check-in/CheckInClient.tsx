'use client';

/**
 * Host check-in interface — mobile-first.
 *
 * Modes:
 *   • List  — searchable attendee list with big tap-to-check buttons
 *   • Scan  — html5-qrcode scanner in the viewport; auto-checks on
 *             successful decode + HMAC verify
 *
 * The scanner library is loaded dynamically on first open so we don't
 * hammer the bundle for hosts who never scan. Camera permission
 * prompt is browser-native; error states are surfaced inline.
 *
 * Offline: check-in actions are fire-and-forget against the server.
 * We optimistically flip UI state immediately so spotty hotel wifi
 * never stalls a scan; server retries will be added in EV-11 polish.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { Search, QrCode, UserPlus, X, Check, Volume2, VolumeX } from 'lucide-react';
import {
  scanCheckIn,
  manualCheckIn,
  walkInAdd,
  undoCheckIn,
  type CheckInResult,
} from './check-in-actions';

interface Assignment {
  id: string;
  status: string;
  ticketTypeId: string;
  ticketName: string;
  isPrimary: boolean;
  checkedInAt: string | null;
}
interface Attendee {
  inviteId: string;
  name: string;
  plusOneName: string | null;
  plusOneAllowed: boolean;
  partnerId: string | null;
  ticketAssignments: Assignment[];
}
interface TicketTypeLite {
  id: string;
  name: string;
  isPrimary: boolean;
}
interface Props {
  eventId: string;
  eventName: string;
  attendees: Attendee[];
  ticketTypes: TicketTypeLite[];
}

type Mode = 'list' | 'scan' | 'walk-in';

export function CheckInClient(props: Props) {
  const [mode, setMode] = useState<Mode>('list');
  const [rows, setRows] = useState<Attendee[]>(props.attendees);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'warn' | 'err' } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  // Restore sound preference from localStorage so hosts don't have to
  // re-toggle it every time they open the page mid-event.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pr:check-in:sound');
      if (saved === '0') setSoundOn(false);
    } catch {
      /* localStorage may be blocked in some browsers */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('pr:check-in:sound', soundOn ? '1' : '0');
    } catch {
      /* noop */
    }
  }, [soundOn]);

  // Feedback on a successful check-in — vibrate (mobile only) + short
  // "bloop" via WebAudio. Kept deliberately lightweight; no audio file
  // fetch, no external lib.
  function signalFeedback(kind: 'ok' | 'warn' | 'err') {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        const pattern = kind === 'ok' ? 40 : kind === 'warn' ? [20, 30, 20] : [60, 40, 60];
        navigator.vibrate(pattern);
      }
    } catch {
      /* vibration API can throw on desktop Firefox — ignore */
    }
    if (!soundOn || kind !== 'ok') return;
    try {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880; // A5 — bright, unambiguously "success"
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      // Close the context after playback so it doesn't leak.
      setTimeout(() => ctx.close().catch(() => null), 500);
    } catch {
      /* WebAudio not available — silently skip */
    }
  }

  const filtered = rows
    .filter((r) => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      if (r.name.toLowerCase().includes(q)) return true;
      if (r.plusOneName?.toLowerCase().includes(q)) return true;
      return false;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function applyResult(result: CheckInResult) {
    if (!result.ok) {
      const msg =
        result.status === 'bad-token'
          ? "Couldn't verify that QR. Try again or check manually."
          : result.status === 'wrong-event'
            ? 'That ticket is for a different event.'
            : result.status === 'not-confirmed'
              ? "That ticket isn't confirmed."
              : 'Check-in failed.';
      setToast({ text: msg, kind: 'err' });
      signalFeedback('err');
      return;
    }
    if (result.status === 'already') {
      setToast({
        text: `${result.inviteeName} already checked in · ${result.ticketName}`,
        kind: 'warn',
      });
      signalFeedback('warn');
      return;
    }
    setToast({
      text: `${result.inviteeName} · ${result.ticketName} ✓`,
      kind: 'ok',
    });
    signalFeedback('ok');
    setRows((prev) =>
      prev.map((r) => {
        if (r.inviteId !== result.inviteId) return r;
        return {
          ...r,
          ticketAssignments: r.ticketAssignments.map((a) =>
            a.id === result.assignmentId ? { ...a, checkedInAt: new Date().toISOString() } : a,
          ),
        };
      }),
    );
  }

  function doManual(assignmentId: string) {
    startTransition(async () => {
      const res = await manualCheckIn({ eventId: props.eventId, assignmentId });
      applyResult(res);
    });
  }

  function doUndo(assignmentId: string) {
    startTransition(async () => {
      const res = await undoCheckIn({ eventId: props.eventId, assignmentId });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => ({
            ...r,
            ticketAssignments: r.ticketAssignments.map((a) =>
              a.id === assignmentId ? { ...a, checkedInAt: null } : a,
            ),
          })),
        );
        setToast({ text: 'Undone', kind: 'warn' });
      }
    });
  }

  function handleScan(token: string) {
    startTransition(async () => {
      const res = await scanCheckIn({ eventId: props.eventId, token });
      applyResult(res);
    });
  }

  function handleWalkIn(args: {
    name: string;
    email?: string;
    phone?: string;
    ticketTypeIds: string[];
    overrideCapacity?: boolean;
  }) {
    startTransition(async () => {
      const res = await walkInAdd({ eventId: props.eventId, ...args });
      if (!res.ok) {
        setToast({
          text:
            res.reason === 'no-capacity'
              ? 'No capacity left. Tap "override" to force.'
              : 'Walk-in failed',
          kind: 'err',
        });
        return;
      }
      setToast({ text: `${args.name} added + checked in ✓`, kind: 'ok' });
      setMode('list');
      // Insert synthetic walk-in row so it shows up immediately.
      const now = new Date().toISOString();
      setRows((prev) => [
        ...prev,
        {
          inviteId: res.inviteId!,
          name: args.name,
          plusOneName: null,
          plusOneAllowed: false,
          partnerId: null,
          ticketAssignments: args.ticketTypeIds.map((tid, idx) => {
            const tt = props.ticketTypes.find((t) => t.id === tid);
            return {
              id: `pending-${res.inviteId}-${idx}`,
              status: 'CONFIRMED',
              ticketTypeId: tid,
              ticketName: tt?.name ?? 'Ticket',
              isPrimary: tt?.isPrimary ?? false,
              checkedInAt: now,
            };
          }),
        },
      ]);
    });
  }

  return (
    <div className="flex-1 overflow-auto">
      {toast ? (
        <div
          className={`pointer-events-none sticky top-[64px] z-20 mx-4 mt-3 rounded-md px-3 py-2 text-sm font-semibold shadow-md ${
            toast.kind === 'ok'
              ? 'bg-emerald-600 text-white'
              : toast.kind === 'warn'
                ? 'bg-amber-500 text-white'
                : 'bg-red-600 text-white'
          }`}
          role="status"
        >
          {toast.text}
        </div>
      ) : null}

      {mode === 'list' && (
        <div className="p-4">
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search attendees…"
                className="h-11 w-full rounded-full border border-gray-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <button
              type="button"
              onClick={() => setMode('scan')}
              className="flex h-11 items-center gap-1 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <QrCode className="h-4 w-4" /> Scan
            </button>
            <button
              type="button"
              onClick={() => setMode('walk-in')}
              className="flex h-11 items-center gap-1 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <UserPlus className="h-4 w-4" /> Walk-in
            </button>
            <button
              type="button"
              onClick={() => setSoundOn((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50"
              title={soundOn ? 'Sound on' : 'Sound off'}
              aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>

          <ul className="space-y-2">
            {filtered.length === 0 && (
              <li className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                No matches. Try a different search, or add a walk-in.
              </li>
            )}
            {filtered.map((a) => (
              <AttendeeRow
                key={a.inviteId}
                attendee={a}
                pending={pending}
                onCheckIn={doManual}
                onUndo={doUndo}
              />
            ))}
          </ul>
        </div>
      )}

      {mode === 'scan' && <Scanner onScan={handleScan} onClose={() => setMode('list')} />}

      {mode === 'walk-in' && (
        <WalkInDrawer
          ticketTypes={props.ticketTypes}
          pending={pending}
          onClose={() => setMode('list')}
          onSubmit={handleWalkIn}
        />
      )}
    </div>
  );
}

function AttendeeRow({
  attendee,
  pending,
  onCheckIn,
  onUndo,
}: {
  attendee: Attendee;
  pending: boolean;
  onCheckIn: (assignmentId: string) => void;
  onUndo: (assignmentId: string) => void;
}) {
  const primary = attendee.ticketAssignments.find((a) => a.isPrimary);
  const anyCheckedIn = attendee.ticketAssignments.some((a) => !!a.checkedInAt);
  const allCheckedIn =
    attendee.ticketAssignments.length > 0 &&
    attendee.ticketAssignments.every((a) => !!a.checkedInAt);

  return (
    <li
      className={`rounded-lg border bg-white p-3 text-sm shadow-sm transition ${
        allCheckedIn ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            allCheckedIn
              ? 'bg-emerald-100 text-emerald-700'
              : anyCheckedIn
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-600'
          }`}
        >
          {initials(attendee.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-gray-900">{attendee.name}</p>
          {attendee.plusOneName ? (
            <p className="mt-0.5 text-xs text-gray-500">+1: {attendee.plusOneName}</p>
          ) : null}
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {attendee.ticketAssignments.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={pending || a.id.startsWith('pending-')}
                  onClick={() => (a.checkedInAt ? onUndo(a.id) : onCheckIn(a.id))}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition disabled:opacity-60 ${
                    a.checkedInAt
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {a.checkedInAt ? <Check className="h-3 w-3" /> : null}
                  {a.ticketName}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {primary && !primary.checkedInAt && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onCheckIn(primary.id)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
            aria-label="Check in"
          >
            <Check className="h-5 w-5" />
          </button>
        )}
      </div>
    </li>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

/** QR scanner — dynamically loads html5-qrcode on mount. */
function Scanner({ onScan, onClose }: { onScan: (token: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let mounted = true;
    (async () => {
      try {
        const mod = await import('html5-qrcode');
        const Html5Qrcode = mod.Html5Qrcode;
        const id = ref.current!.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const instance = new Html5Qrcode(id) as any;
        const config = { fps: 10, qrbox: { width: 240, height: 240 } };
        await instance.start(
          { facingMode: 'environment' },
          config,
          (decoded: string) => {
            if (!mounted) return;
            // Guard against rapid repeats — the scanner fires every
            // frame while the code is in view.
            setLastScan((prev) => (prev === decoded ? prev : decoded));
          },
          () => {
            /* ignore per-frame decode errors */
          },
        );
        scanner = instance as unknown as typeof scanner;
      } catch (err) {
        console.warn('[check-in] scanner failed to start', err);
        setError(
          err instanceof Error ? err.message : 'Camera unavailable — use manual check-in instead.',
        );
      }
    })();
    return () => {
      mounted = false;
      scanner?.stop().catch(() => null);
      try {
        scanner?.clear();
      } catch {
        /* noop */
      }
    };
  }, []);

  // Debounce repeat scans — only fire onScan on transition.
  useEffect(() => {
    if (!lastScan) return;
    onScan(lastScan);
    // Clear so the same code can be re-scanned after a short window.
    const id = setTimeout(() => setLastScan(null), 1500);
    return () => clearTimeout(id);
  }, [lastScan, onScan]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold">Scan a QR ticket</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
          aria-label="Close scanner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <div id="check-in-qr-scanner" ref={ref} className="h-full w-full bg-black" />
      </div>
      {error ? (
        <div className="px-4 py-3 text-xs text-red-300">
          {error}
          <button type="button" onClick={onClose} className="ml-2 underline">
            Go back
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 text-center text-[11px] text-white/60">
          Point at the QR on the invitee's phone. We'll beep (well, flash a toast) when it's in.
        </div>
      )}
    </div>
  );
}

function WalkInDrawer({
  ticketTypes,
  pending,
  onClose,
  onSubmit,
}: {
  ticketTypes: TicketTypeLite[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (args: {
    name: string;
    email?: string;
    phone?: string;
    ticketTypeIds: string[];
    overrideCapacity?: boolean;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const primary = ticketTypes.find((t) => t.isPrimary);
  const [selected, setSelected] = useState<Set<string>>(new Set(primary ? [primary.id] : []));
  const [override, setOverride] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function submit() {
    onSubmit({
      name,
      email: email || undefined,
      phone: phone || undefined,
      ticketTypeIds: [...selected],
      overrideCapacity: override || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black/50">
      <button type="button" onClick={onClose} className="flex-1" aria-label="Close drawer" />
      <div className="rounded-t-2xl bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Add walk-in</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="tel"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <p className="mt-3 text-[11px] uppercase tracking-label text-gray-500">Tickets</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {ticketTypes.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                  selected.has(t.id)
                    ? 'bg-indigo-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-[12px] text-gray-600">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />
          Override capacity (primary is full)
        </label>
        <button
          type="button"
          disabled={pending || !name.trim() || selected.size === 0}
          onClick={submit}
          className="mt-4 h-11 w-full rounded-full bg-indigo-600 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? 'Adding…' : 'Add + check in'}
        </button>
      </div>
    </div>
  );
}
