/**
 * Tiny date helpers — kept here instead of adding date-fns as a dep.
 * All weeks start on Sunday to match Storm (and US roofing convention).
 */

export function startOfWeek(d: Date, weekStartsOn = 0): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const diff = (x.getDay() - weekStartsOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

export function endOfWeek(d: Date, weekStartsOn = 0): Date {
  const s = startOfWeek(d, weekStartsOn);
  const e = new Date(s);
  e.setDate(e.getDate() + 7);
  e.setMilliseconds(e.getMilliseconds() - 1);
  return e;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatRange(start: Date, end: Date): string {
  const sm = start.toLocaleDateString(undefined, { month: 'long' });
  const em = end.toLocaleDateString(undefined, { month: 'long' });
  const y = start.getFullYear() === end.getFullYear() ? start.getFullYear() : '';
  if (sm === em) {
    return `${sm} ${start.getDate()}–${end.getDate()}${y ? `, ${y}` : ''}`;
  }
  return `${sm} ${start.getDate()} – ${em} ${end.getDate()}${y ? `, ${y}` : ''}`;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
