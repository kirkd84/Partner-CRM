/**
 * Calendar conflict detection — pure function, no DB access.
 *
 * SPEC §6.4: "On save: if overlap, show inline warning 'Overlaps with:
 * [event title] at [time]' with Save anyway / Cancel buttons."
 *
 * Conflict == two time intervals share any instant. We use half-open
 * comparison (`aStart < bEnd && bStart < aEnd`) so back-to-back events
 * ("10:00–11:00" then "11:00–12:00") do NOT conflict — the 11:00
 * instant belongs only to the second event.
 *
 * All-day events span from local midnight to the next midnight; the
 * caller should normalise to startsAt=00:00 and endsAt=next 00:00 in
 * the viewing user's timezone before handing them in.
 *
 * This is deliberately a pure function so it can be unit-tested and
 * re-used on both the server (pre-save validation) and the client
 * (live preview as the user edits the drawer).
 */
export interface CalendarInterval {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  /** Hint for the UI: "internal" / "external" (Google/MS/Apple/Storm). */
  source?: 'internal' | 'google' | 'microsoft' | 'apple' | 'storm';
}

export interface Conflict {
  other: CalendarInterval;
  /** Milliseconds of overlap — handy for ranking the most-annoying hit. */
  overlapMs: number;
}

export interface DetectConflictsArgs {
  /** The event being saved. */
  candidate: Pick<CalendarInterval, 'startsAt' | 'endsAt'>;
  /** All events the user already has on their calendar. */
  others: CalendarInterval[];
  /** When editing an existing event, skip it so it doesn't conflict with itself. */
  ignoreId?: string;
}

export function detectConflicts({ candidate, others, ignoreId }: DetectConflictsArgs): Conflict[] {
  const cs = candidate.startsAt.getTime();
  const ce = candidate.endsAt.getTime();
  if (!(cs < ce)) return []; // zero-length or inverted — nothing can overlap

  const hits: Conflict[] = [];
  for (const o of others) {
    if (ignoreId && o.id === ignoreId) continue;
    const os = o.startsAt.getTime();
    const oe = o.endsAt.getTime();
    if (cs < oe && os < ce) {
      hits.push({ other: o, overlapMs: Math.min(ce, oe) - Math.max(cs, os) });
    }
  }
  // Most-overlap first so the UI can surface the worst conflict at the top.
  hits.sort((a, b) => b.overlapMs - a.overlapMs);
  return hits;
}

/** Human-friendly "Overlaps with {title} at {range}" formatter. */
export function formatConflictMessage(c: Conflict): string {
  const s = c.other.startsAt;
  const e = c.other.endsAt;
  const sameDay = s.toDateString() === e.toDateString();
  const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const dateFmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const when = sameDay
    ? `${s.toLocaleDateString(undefined, dateFmt)} ${s.toLocaleTimeString(
        undefined,
        timeFmt,
      )}–${e.toLocaleTimeString(undefined, timeFmt)}`
    : `${s.toLocaleString(undefined, { ...dateFmt, ...timeFmt })} → ${e.toLocaleString(undefined, {
        ...dateFmt,
        ...timeFmt,
      })}`;
  return `Overlaps with "${c.other.title}" at ${when}`;
}
