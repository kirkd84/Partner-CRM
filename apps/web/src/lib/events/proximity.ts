/**
 * Proximity-aware response-window defaults (SPEC_EVENTS §2.5).
 *
 * Used by the batch-send path, the cascade engine, and the client-side
 * invite preview. Kept in its own file (not in invite-actions.ts) so
 * it can be imported by both client and server code — a 'use server'
 * file is only allowed to export async functions.
 *
 * Returns hours; callers multiply by 3600_000 for ms.
 */

export function proximityWindowHours(eventStartsAt: Date, now: Date = new Date()): number {
  const ms = eventStartsAt.getTime() - now.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  if (days >= 30) return 5 * 24;
  if (days >= 14) return 3 * 24;
  if (days >= 7) return 2 * 24;
  if (days >= 3) return 24;
  if (days >= 1) return 6;
  return 2; // < 24 hours
}
