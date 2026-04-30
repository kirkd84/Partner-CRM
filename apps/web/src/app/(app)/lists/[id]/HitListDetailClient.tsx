'use client';
import { Fragment, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button, DrawerModal, Pill } from '@partnerradar/ui';
import {
  PARTNER_TYPE_LABELS,
  STAGE_COLORS,
  STAGE_LABELS,
  type PartnerStage,
  type PartnerType,
} from '@partnerradar/types';
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Circle,
  Clock,
  GripVertical,
  Loader2,
  Navigation,
  Plus,
  Route,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  addPartnerToList,
  deleteHitList,
  markStopComplete,
  optimizeHitList,
  removeStop,
  reorderStops,
} from '../actions';
import { sendDayToCalendar } from '../plans/actions';
import { RouteMap } from './RouteMap';

interface StopPartner {
  id: string;
  publicId: string;
  companyName: string;
  partnerType: PartnerType;
  stage: PartnerStage;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
}
interface Stop {
  id: string;
  order: number;
  plannedArrival: string;
  plannedDurationMin: number;
  /** Drive distance + duration from the previous stop (or from start for stop 1). */
  distanceFromPrevMi: number | null;
  durationFromPrevMin: number | null;
  /** Estimated arrival, set by the multi-day planner. */
  arrivalEta: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  partner: StopPartner;
}
interface AvailablePartner {
  id: string;
  publicId: string;
  companyName: string;
  partnerType: PartnerType;
  stage: PartnerStage;
  city: string | null;
  state: string | null;
}

export function HitListDetailClient({
  list,
  stops: initialStops,
  availablePartners,
}: {
  list: {
    id: string;
    date: string;
    marketName: string;
    startAddress: string;
    startLat: number;
    startLng: number;
    startMode: string;
    userName: string;
    isOwnedByMe: boolean;
    totalDistance: number | null;
    totalDuration: number | null;
    plan: {
      id: string;
      label: string | null;
      totalDays: number;
      dayIndex: number;
    } | null;
  };
  stops: Stop[];
  availablePartners: AvailablePartner[];
}) {
  const [sendingToCalendar, setSendingToCalendar] = useState(false);
  const [calendarMsg, setCalendarMsg] = useState<string | null>(null);
  const [stops, setStops] = useState(initialStops);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeMsg, setOptimizeMsg] = useState<string | null>(null);

  function onOptimize() {
    if (stops.length === 0) {
      setOptimizeMsg('Add some partners first.');
      return;
    }
    setOptimizing(true);
    setOptimizeMsg(null);
    startTransition(async () => {
      try {
        const result = await optimizeHitList(list.id);
        if (result.ok) {
          const provider =
            result.provider === 'google-directions' ? 'Google Directions' : 'distance heuristic';
          let msg = `Routed via ${provider}: ${result.totalDistance} mi · ~${result.totalDuration} min total`;
          if (result.skippedNoGeo > 0) {
            msg += ` (${result.skippedNoGeo} stop${result.skippedNoGeo === 1 ? '' : 's'} missing lat/lng — geocode their address first)`;
          }
          setOptimizeMsg(msg);
        } else {
          setOptimizeMsg(result.reason);
        }
      } catch (err) {
        setOptimizeMsg(err instanceof Error ? err.message : 'Optimize failed');
      } finally {
        setOptimizing(false);
      }
    });
  }

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availablePartners.slice(0, 50);
    return availablePartners
      .filter(
        (p) =>
          p.companyName.toLowerCase().includes(q) ||
          p.publicId.toLowerCase().includes(q) ||
          (p.city ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [search, availablePartners]);

  const dateLabel = new Date(list.date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  function onDragStart(id: string) {
    setDragId(id);
  }
  function onDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const from = stops.findIndex((s) => s.id === dragId);
    const to = stops.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const next = stops.slice();
    const moved = next.splice(from, 1)[0];
    if (!moved) return;
    next.splice(to, 0, moved);
    setStops(next);
  }
  function onDragEnd() {
    if (!dragId) return;
    setDragId(null);
    startTransition(async () => {
      try {
        await reorderStops(
          list.id,
          stops.map((s) => s.id),
        );
      } catch (err) {
        console.error(err);
      }
    });
  }

  function onAdd(partnerId: string) {
    startTransition(async () => {
      try {
        await addPartnerToList(list.id, partnerId);
        // server revalidates; close drawer after first add so reps can add many quickly
      } catch (err) {
        console.error(err);
      }
    });
  }

  function onRemove(stopId: string) {
    if (!confirm('Remove this stop from the hit list?')) return;
    startTransition(async () => {
      try {
        await removeStop(stopId);
        setStops((prev) => prev.filter((s) => s.id !== stopId));
      } catch (err) {
        console.error(err);
      }
    });
  }

  function onToggleComplete(stopId: string) {
    startTransition(async () => {
      try {
        await markStopComplete(stopId);
        setStops((prev) =>
          prev.map((s) =>
            s.id === stopId
              ? { ...s, completedAt: s.completedAt ? null : new Date().toISOString() }
              : s,
          ),
        );
      } catch (err) {
        console.error(err);
      }
    });
  }

  function onDeleteList() {
    if (!confirm('Delete this hit list? This cannot be undone.')) return;
    startTransition(async () => {
      try {
        await deleteHitList(list.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not delete';
        if (!msg.includes('NEXT_REDIRECT')) console.error(err);
      }
    });
  }

  async function onSendToCalendar() {
    setSendingToCalendar(true);
    setCalendarMsg(null);
    try {
      const r = await sendDayToCalendar(list.id);
      setCalendarMsg(
        r.created > 0
          ? `Added ${r.created} stop${r.created === 1 ? '' : 's'} to your calendar${r.skipped > 0 ? ` (${r.skipped} skipped)` : ''}.`
          : (r.reason ?? 'No stops were added.'),
      );
    } catch (err) {
      setCalendarMsg(err instanceof Error ? err.message : 'Calendar sync failed');
    } finally {
      setSendingToCalendar(false);
    }
  }

  const completed = stops.filter((s) => s.completedAt).length;
  const pct = stops.length ? Math.round((completed / stops.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1100px] p-6">
      <Link
        href="/lists"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to hit lists
      </Link>

      <header className="mt-3 flex items-start gap-3">
        <div className="flex-1">
          {list.plan && (
            <Link
              href={`/lists/plans/${list.plan.id}`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:underline"
            >
              {list.plan.label || 'Multi-day plan'} · day {list.plan.dayIndex + 1} of{' '}
              {list.plan.totalDays}
            </Link>
          )}
          <h1 className="text-xl font-semibold text-gray-900">{dateLabel}</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {list.marketName} · Start from {list.startAddress} (
            {list.startMode.toLowerCase().replace('_', ' ')})
            {list.isOwnedByMe ? '' : ` · ${list.userName}'s list`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setAddOpen(true)} disabled={!list.isOwnedByMe && false}>
            <Plus className="h-4 w-4" /> Add partners
          </Button>
          <Button
            variant="secondary"
            onClick={onOptimize}
            loading={optimizing}
            disabled={stops.length === 0}
          >
            {optimizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Optimize route
          </Button>
          <Button
            variant="secondary"
            onClick={onSendToCalendar}
            loading={sendingToCalendar}
            disabled={stops.length === 0}
          >
            <CalendarPlus className="h-4 w-4" /> Send to calendar
          </Button>
          <Link
            href={`/lists/${list.id}/run`}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
          >
            <Navigation className="h-4 w-4" /> Run hit list
          </Link>
          <Button variant="destructive" onClick={onDeleteList} loading={isPending}>
            Delete list
          </Button>
        </div>
      </header>
      {(list.totalDistance != null || list.totalDuration != null) && stops.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
          {list.totalDistance != null && (
            <span className="inline-flex items-center gap-1">
              <Route className="h-3 w-3 text-amber-500" />
              {list.totalDistance.toFixed(1)} mi total drive
            </span>
          )}
          {list.totalDuration != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-blue-500" />
              {Math.floor(list.totalDuration / 60)}h {list.totalDuration % 60}m total day
            </span>
          )}
          <span className="text-gray-400">
            ({stops.length} stop{stops.length === 1 ? '' : 's'} ·{' '}
            {stops.reduce((acc, s) => acc + s.plannedDurationMin, 0)} min visit time)
          </span>
        </div>
      )}
      {calendarMsg && (
        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {calendarMsg}
        </div>
      )}
      {optimizeMsg && (
        <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {optimizeMsg}
        </div>
      )}
      {stops.some((s) => s.partner.lat != null && s.partner.lng != null) && (
        <div className="mt-3">
          <RouteMap
            start={{ lat: list.startLat, lng: list.startLng, label: list.startAddress }}
            stops={stops
              .filter(
                (s): s is Stop & { partner: StopPartner & { lat: number; lng: number } } =>
                  s.partner.lat != null && s.partner.lng != null,
              )
              .map((s, idx) => ({
                id: s.id,
                order: idx + 1,
                lat: s.partner.lat,
                lng: s.partner.lng,
                label: s.partner.companyName,
                completed: !!s.completedAt,
              }))}
          />
        </div>
      )}

      {stops.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded bg-gray-100">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums text-gray-600">
            {completed}/{stops.length} complete ({pct}%)
          </span>
        </div>
      )}

      <section className="mt-5">
        {stops.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-sm font-medium text-gray-900">No stops yet</p>
            <p className="mt-1 text-xs text-gray-500">
              Drop partners onto this list to plan your day. They&apos;ll appear in visit order
              here.
            </p>
            <div className="mt-4 flex justify-center">
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add partners
              </Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {stops.map((s, idx) => {
              const isComplete = !!s.completedAt;
              const address = [s.partner.address, s.partner.city, s.partner.state, s.partner.zip]
                .filter(Boolean)
                .join(', ');
              const eta = s.arrivalEta ? new Date(s.arrivalEta) : null;
              const etaLabel = eta
                ? eta.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'UTC',
                  })
                : null;
              return (
                <Fragment key={s.id}>
                  {/* Inter-stop leg: shows the drive between this stop and the previous one. */}
                  {idx > 0 && s.distanceFromPrevMi != null && s.durationFromPrevMin != null && (
                    <li className="my-1 ml-9 flex list-none items-center gap-2 text-[10.5px] text-gray-400">
                      <span className="h-3 w-px bg-gray-200" />
                      <Route className="h-3 w-3" />
                      {s.distanceFromPrevMi.toFixed(1)} mi · {s.durationFromPrevMin} min drive
                    </li>
                  )}
                  <li
                    draggable
                    onDragStart={() => onDragStart(s.id)}
                    onDragOver={(e) => onDragOver(e, s.id)}
                    onDragEnd={onDragEnd}
                    className={
                      `flex items-center gap-3 rounded-lg border border-card-border bg-white p-3 shadow-card transition ` +
                      (dragId === s.id ? 'opacity-50' : '')
                    }
                  >
                    <span className="cursor-grab text-gray-400" title="Drag to reorder">
                      <GripVertical className="h-5 w-5" />
                    </span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleComplete(s.id)}
                      className="flex items-center"
                      aria-label={isComplete ? 'Mark as incomplete' : 'Mark as complete'}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-gray-300 hover:text-gray-500" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/partners/${s.partner.id}`}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          {s.partner.companyName}
                        </Link>
                        <span className="font-mono text-[11px] text-gray-400">
                          {s.partner.publicId}
                        </span>
                        <Pill tone="soft" color={STAGE_COLORS[s.partner.stage]}>
                          {STAGE_LABELS[s.partner.stage]}
                        </Pill>
                      </div>
                      <div className="truncate text-[11px] text-gray-500">
                        {PARTNER_TYPE_LABELS[s.partner.partnerType]}
                        {address ? ` · ${address}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 text-[11px] tabular-nums">
                      {etaLabel && (
                        <span className="font-semibold text-blue-700">ETA {etaLabel}</span>
                      )}
                      <span className="text-gray-500">~{s.plannedDurationMin} min visit</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(s.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove stop"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </section>

      <DrawerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add partners to list"
        width="520px"
        footer={
          <Button variant="secondary" onClick={() => setAddOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              placeholder="Search partners by name, ID, or city…"
              className="w-full rounded-md border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="text-[11px] text-gray-500">
            {filteredAvailable.length}{' '}
            {availablePartners.length > filteredAvailable.length ? 'shown' : 'available'}
            {availablePartners.length > filteredAvailable.length
              ? ` · ${availablePartners.length} total`
              : ''}
          </div>
          <ul className="divide-y divide-gray-100">
            {filteredAvailable.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">
                      {p.companyName}
                    </span>
                    <span className="font-mono text-[11px] text-gray-400">{p.publicId}</span>
                  </div>
                  <div className="truncate text-[11px] text-gray-500">
                    {PARTNER_TYPE_LABELS[p.partnerType]}
                    {p.city ? ` · ${p.city}, ${p.state ?? ''}` : ''}
                    {' · '}
                    {STAGE_LABELS[p.stage]}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onAdd(p.id)}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </li>
            ))}
            {filteredAvailable.length === 0 && (
              <li className="py-6 text-center text-xs text-gray-500">
                No partners match. Add one from the Partners page and come back.
              </li>
            )}
          </ul>
        </div>
      </DrawerModal>
    </div>
  );
}
