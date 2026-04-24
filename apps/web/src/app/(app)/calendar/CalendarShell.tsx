'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button, Pill } from '@partnerradar/ui';
import {
  addDays,
  addWeeks,
  endOfWeek,
  fmtTime,
  formatRange,
  isSameDay,
  startOfWeek,
} from './dateUtils';

export interface CalendarItem {
  id: string;
  title: string;
  type: string;
  location: string | null;
  startsAt: string; // ISO
  endsAt: string;
  allDay?: boolean;
  partner: { id: string; name: string; publicId?: string } | null;
  // Team-view metadata. When redacted=true the caller doesn't own
  // the event, title/location are already stripped server-side, and
  // we render the block in the rep's avatar color with a "Busy" label.
  ownerId?: string;
  ownerFirstName?: string | null;
  ownerColor?: string | null;
  redacted?: boolean;
}

export interface ExternalItem {
  id: string;
  externalEventId: string;
  provider: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  ownerId?: string;
  ownerFirstName?: string | null;
  ownerColor?: string | null;
  redacted?: boolean;
}

type View = 'week' | 'day' | 'list';
type Scope = 'me' | 'team';

export function CalendarShell({
  view,
  scope,
  anchorISO,
  appointments,
  events,
  externals,
}: {
  view: View;
  scope: Scope;
  anchorISO: string;
  appointments: CalendarItem[];
  events: CalendarItem[];
  externals: ExternalItem[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const anchor = useMemo(() => new Date(anchorISO), [anchorISO]);

  // All items merged into one list, with a `kind` tag for styling.
  type Merged = {
    id: string;
    kind: 'appointment' | 'event' | 'external';
    provider?: string;
    title: string;
    type: string;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
    partner: { id: string; name: string; publicId?: string } | null;
    ownerFirstName?: string | null;
    ownerColor?: string | null;
    redacted?: boolean;
  };
  const merged: Merged[] = useMemo(
    () => [
      ...appointments.map(
        (a): Merged => ({
          ...a,
          kind: 'appointment',
          startsAt: new Date(a.startsAt),
          endsAt: new Date(a.endsAt),
        }),
      ),
      ...events.map(
        (e): Merged => ({
          ...e,
          kind: 'event',
          startsAt: new Date(e.startsAt),
          endsAt: new Date(e.endsAt),
        }),
      ),
      ...externals.map(
        (x): Merged => ({
          id: x.id,
          kind: 'external',
          provider: x.provider,
          title: x.title,
          type: `External · ${x.provider}`,
          location: x.location,
          startsAt: new Date(x.startsAt),
          endsAt: new Date(x.endsAt),
          partner: null,
          ownerFirstName: x.ownerFirstName ?? null,
          ownerColor: x.ownerColor ?? null,
          redacted: x.redacted ?? false,
        }),
      ),
    ],
    [appointments, events, externals],
  );

  const navigate = (delta: number) => {
    const newAnchor = view === 'day' ? addDays(anchor, delta) : addWeeks(anchor, delta);
    const qs = new URLSearchParams(params.toString());
    qs.set('date', newAnchor.toISOString());
    qs.set('view', view);
    router.push(`/calendar?${qs.toString()}`);
  };

  const setView = (v: View) => {
    const qs = new URLSearchParams(params.toString());
    qs.set('view', v);
    qs.set('date', anchor.toISOString());
    router.push(`/calendar?${qs.toString()}`);
  };

  const setScope = (s: Scope) => {
    const qs = new URLSearchParams(params.toString());
    qs.set('scope', s);
    qs.set('date', anchor.toISOString());
    qs.set('view', view);
    router.push(`/calendar?${qs.toString()}`);
  };

  const goToday = () => {
    const qs = new URLSearchParams(params.toString());
    qs.set('date', new Date().toISOString());
    qs.set('view', view);
    router.push(`/calendar?${qs.toString()}`);
  };

  const ws = startOfWeek(anchor);
  const we = endOfWeek(anchor);
  const rangeLabel =
    view === 'day'
      ? anchor.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : formatRange(ws, we);

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-3">
        <CalendarIcon className="h-5 w-5 text-gray-500" />
        <h1 className="text-lg font-semibold text-gray-900">{rangeLabel}</h1>

        <div className="ml-3 flex items-center gap-1 rounded-md border border-gray-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="ml-2 flex items-center gap-0.5 rounded-md border border-gray-200 bg-white p-0.5">
          {(['week', 'day', 'list'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded px-2.5 py-1 text-xs font-semibold capitalize transition ${
                view === v
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Scope toggle — My calendar vs Team calendar. Team view
            shows everyone in your markets as "Busy · {name}" blocks
            so you can schedule around them without seeing details. */}
        <div className="ml-2 flex items-center gap-0.5 rounded-md border border-gray-200 bg-white p-0.5">
          {(
            [
              ['me', 'Mine'],
              ['team', 'Team'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              title={
                key === 'me'
                  ? 'Your own calendar'
                  : "Your team — other reps' time shows as Busy blocks with no details"
              }
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                scope === key
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <NewEventButton anchorISO={anchor.toISOString()} />
        </div>
      </header>

      {/* Legend */}
      <div className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-2 text-[11px]">
        {scope === 'me' ? (
          <>
            <LegendSwatch color="#3b82f6" label="Appointment" />
            <LegendSwatch color="#8b5cf6" label="Event" />
            <LegendSwatch color="#d1d5db" striped label="External (read-only)" />
          </>
        ) : (
          <>
            <LegendSwatch color="#3b82f6" label="Your stuff" />
            <LegendSwatch color="#94a3b8" striped label="Teammate busy (details hidden)" />
          </>
        )}
        <span className="ml-auto text-gray-500">
          {appointments.length} appt · {events.length} event · {externals.length} external
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {view === 'week' && <WeekGrid anchor={anchor} items={merged} />}
        {view === 'day' && <DayGrid anchor={anchor} items={merged} />}
        {view === 'list' && <ListView items={merged} />}
      </div>
    </div>
  );
}

function LegendSwatch({
  color,
  label,
  striped,
}: {
  color: string;
  label: string;
  striped?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-600">
      <span
        className="inline-block h-2.5 w-4 rounded-sm"
        style={{
          backgroundColor: color,
          backgroundImage: striped
            ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15) 3px, transparent 3px, transparent 6px)'
            : undefined,
        }}
      />
      {label}
    </span>
  );
}

// ─── Week view ──────────────────────────────────────────────────────
function WeekGrid({
  anchor,
  items,
}: {
  anchor: Date;
  items: Array<{
    id: string;
    kind: 'appointment' | 'event' | 'external';
    provider?: string;
    title: string;
    type: string;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
    partner: { id: string; name: string; publicId?: string } | null;
  }>;
}) {
  const ws = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const HOUR_H = 48; // px per hour

  return (
    <div className="grid grid-cols-[60px_repeat(7,1fr)] border-card-border bg-white">
      {/* Hour labels + header row */}
      <div className="sticky top-0 z-10 border-b border-card-border bg-white" />
      {days.map((d) => (
        <div
          key={d.toISOString()}
          className={`sticky top-0 z-10 border-b border-l border-card-border bg-white px-2 py-2 text-center ${
            isSameDay(d, new Date()) ? 'bg-blue-50/60' : ''
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-label text-gray-500">
            {d.toLocaleDateString(undefined, { weekday: 'short' })}
          </div>
          <div
            className={`mt-0.5 text-lg font-semibold ${
              isSameDay(d, new Date()) ? 'text-primary' : 'text-gray-900'
            }`}
          >
            {d.getDate()}
          </div>
        </div>
      ))}

      {/* Hour rows */}
      {HOURS.map((h) => (
        <Fragment key={`row-${h}`}>
          <div
            className="border-b border-card-border px-2 text-right text-[10px] text-gray-400"
            style={{ height: HOUR_H }}
          >
            {h === 0 ? '' : fmtHour(h)}
          </div>
          {days.map((d) => (
            <div
              key={`${d.toISOString()}-${h}`}
              className={`relative border-b border-l border-card-border ${
                isSameDay(d, new Date()) ? 'bg-blue-50/20' : ''
              }`}
              style={{ height: HOUR_H }}
            >
              {/* Events that start in this hour cell */}
              {items
                .filter(
                  (it) =>
                    isSameDay(it.startsAt, d) && it.startsAt.getHours() === h && !isAllDayish(it),
                )
                .map((it) => (
                  <EventBlock key={`${it.kind}-${it.id}`} item={it} hourHeight={HOUR_H} />
                ))}
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function EventBlock({
  item,
  hourHeight,
}: {
  item: {
    id: string;
    kind: 'appointment' | 'event' | 'external';
    provider?: string;
    title: string;
    type: string;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
    partner: { id: string; name: string; publicId?: string } | null;
    ownerColor?: string | null;
    redacted?: boolean;
  };
  hourHeight: number;
}) {
  const durationMin = Math.max(
    15,
    Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60000),
  );
  const offsetMin = item.startsAt.getMinutes();
  const h = (durationMin / 60) * hourHeight;
  const t = (offsetMin / 60) * hourHeight;
  // Redacted team events are coloured with the OWNER's avatar tint so
  // you can tell at a glance whose block you're looking at, with a
  // diagonal-stripe pattern to signal "details hidden".
  const color = item.redacted
    ? (item.ownerColor ?? '#94a3b8')
    : item.kind === 'external'
      ? '#d1d5db'
      : item.kind === 'event'
        ? '#8b5cf6'
        : '#3b82f6';
  const striped = item.redacted || item.kind === 'external';
  const tooltip = item.redacted
    ? `${item.title} · ${fmtTime(item.startsAt.toISOString())}–${fmtTime(item.endsAt.toISOString())} · details hidden`
    : `${item.title} · ${fmtTime(item.startsAt.toISOString())}–${fmtTime(item.endsAt.toISOString())}`;

  const content = (
    <div
      className={`absolute inset-x-1 rounded-sm border border-white/70 px-1.5 py-1 text-[11px] leading-tight text-white shadow-sm`}
      style={{
        top: t,
        height: h,
        backgroundColor: color,
        backgroundImage: striped
          ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.18), rgba(0,0,0,0.18) 4px, transparent 4px, transparent 8px)'
          : undefined,
        color: item.kind === 'external' && !item.redacted ? '#374151' : 'white',
      }}
      title={tooltip}
    >
      <div className="truncate font-semibold">{item.title}</div>
      <div className="truncate opacity-90">{fmtTime(item.startsAt.toISOString())}</div>
    </div>
  );

  // Only link to the partner when the caller actually owns the event;
  // redacted rows have no partner context and should feel inert.
  if (!item.redacted && item.kind === 'appointment' && item.partner?.publicId) {
    return <Link href={`/partners/${item.partner.id}`}>{content}</Link>;
  }
  return content;
}

function isAllDayish(it: { startsAt: Date; endsAt: Date }): boolean {
  const hrs = (it.endsAt.getTime() - it.startsAt.getTime()) / 36e5;
  return hrs >= 20; // treat ≥20h spans as all-day strips
}

function fmtHour(h: number): string {
  if (h === 12) return '12 PM';
  if (h === 0) return '12 AM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// ─── Day view ───────────────────────────────────────────────────────
function DayGrid({
  anchor,
  items,
}: {
  anchor: Date;
  items: Array<{
    id: string;
    kind: 'appointment' | 'event' | 'external';
    provider?: string;
    title: string;
    type: string;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
    partner: { id: string; name: string; publicId?: string } | null;
  }>;
}) {
  const sameDay = items.filter((it) => isSameDay(it.startsAt, anchor));
  if (sameDay.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-white p-10 text-center">
        <CalendarIcon className="h-8 w-8 text-gray-300" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900">Nothing scheduled</h3>
        <p className="text-xs text-gray-500">
          Your day is wide open. Use "+ New event" to book something.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-2 p-6">
      {sameDay
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map((it) => (
          <ListRow key={`${it.kind}-${it.id}`} item={it} />
        ))}
    </div>
  );
}

// ─── List view ──────────────────────────────────────────────────────
function ListView({
  items,
}: {
  items: Array<{
    id: string;
    kind: 'appointment' | 'event' | 'external';
    provider?: string;
    title: string;
    type: string;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
    partner: { id: string; name: string; publicId?: string } | null;
  }>;
}) {
  const sorted = [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (sorted.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-white p-10 text-center">
        <CalendarIcon className="h-8 w-8 text-gray-300" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900">Nothing scheduled</h3>
      </div>
    );
  }
  // Group by date heading
  const groups = new Map<string, typeof sorted>();
  for (const it of sorted) {
    const key = it.startsAt.toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      {Array.from(groups.entries()).map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-label text-gray-500">
            {day}
          </h2>
          <div className="space-y-1.5">
            {list.map((it) => (
              <ListRow key={`${it.kind}-${it.id}`} item={it} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ListRow({
  item,
}: {
  item: {
    id: string;
    kind: 'appointment' | 'event' | 'external';
    provider?: string;
    title: string;
    type: string;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
    partner: { id: string; name: string; publicId?: string } | null;
    ownerColor?: string | null;
    redacted?: boolean;
  };
}) {
  const dotColor = item.redacted
    ? (item.ownerColor ?? '#9ca3af')
    : item.kind === 'external'
      ? '#9ca3af'
      : item.kind === 'event'
        ? '#8b5cf6'
        : '#3b82f6';
  const body = (
    <div
      className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition ${
        item.redacted
          ? 'border-dashed border-gray-300 bg-gray-50 opacity-90'
          : item.kind === 'external'
            ? 'border-dashed border-gray-300 bg-gray-50'
            : 'border-card-border bg-white hover:border-primary/50 hover:bg-blue-50/40'
      }`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-gray-900">{item.title}</div>
        <div className="truncate text-[11px] text-gray-500">
          {fmtTime(item.startsAt.toISOString())}–{fmtTime(item.endsAt.toISOString())}
          {!item.redacted && item.type && <span className="ml-2">· {item.type}</span>}
          {!item.redacted && item.partner && <span className="ml-2">· {item.partner.name}</span>}
          {!item.redacted && item.location && <span className="ml-2">· {item.location}</span>}
          {item.redacted && <span className="ml-2">· details hidden</span>}
        </div>
      </div>
      {item.kind === 'external' && !item.redacted && item.provider && (
        <Pill color="#6b7280" tone="soft">
          from {item.provider}
        </Pill>
      )}
    </div>
  );
  if (!item.redacted && item.kind === 'appointment' && item.partner?.id) {
    return <Link href={`/partners/${item.partner.id}`}>{body}</Link>;
  }
  return body;
}

// ─── "+ New event" — opens the appointment drawer in a tiny Client Modal ──
function NewEventButton({ anchorISO: _ }: { anchorISO: string }) {
  // For now we just link to /partners — users pick a partner first and
  // use the existing appointment drawer on that page. Phase 4.1 can
  // add a partner-picker modal directly in the calendar header; the
  // drawer component is shared so there's no code duplication.
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New event
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-card-border bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900">Pick a partner first</h2>
            <p className="mt-1 text-xs text-gray-600">
              Appointments live on a partner record so revenue attribution + the activity feed stay
              tied together. Open a partner and hit <strong>+ New appointment</strong> from there.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Link href="/partners">
                <Button>Go to Partners</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
