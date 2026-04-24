/**
 * Reminder schedule — generate EvReminder rows for an invite.
 *
 * SPEC_EVENTS §2.5 + §2.6:
 *   Proximity    ConfirmationCascadeStart  AutoCancelCutoff
 *   ≥30d         T-5d                      T-2d
 *   14-29d       T-5d                      T-2d
 *   7-13d        T-5d                      T-2d
 *   3-6d         T-3d                      T-1d
 *   1-2d         T-1d                      T-4h
 *   <24h         n/a (one-shot)            T-1h
 *
 * Nudges: at cascadeStart, +24h, +36h, and every 12h until auto-cancel.
 *
 * We also pre-schedule day-before (T-1d) and arrival (T-4h) reminders
 * for confirmed attendees — §2.7. These belong to the same invite
 * lifecycle so it's easier to write them all at once and let the
 * dispatcher filter by kind.
 *
 * Idempotent — if reminders already exist for an invite, we wipe the
 * pending ones (sentAt IS NULL) and regenerate so event date changes
 * propagate cleanly.
 */

import { prisma, Prisma } from '@partnerradar/db';

export type ReminderKind =
  | 'INITIAL_INVITE'
  | 'CONFIRMATION_REQUEST'
  | 'CONFIRMATION_NUDGE_1'
  | 'CONFIRMATION_NUDGE_2'
  | 'AUTO_CANCEL_NOTICE'
  | 'DAY_BEFORE'
  | 'ARRIVAL_DETAILS'
  | 'SETUP_T_MINUS_4H'
  | 'SETUP_T_MINUS_1H'
  | 'CUSTOM';

export interface ProximityOffsets {
  cascadeStartHoursBeforeEvent: number;
  autoCancelHoursBeforeEvent: number;
  nudgeHoursAfterStart: number[];
}

export function proximityOffsets(eventStartsAt: Date, now: Date = new Date()): ProximityOffsets {
  const hoursUntil = (eventStartsAt.getTime() - now.getTime()) / (3600 * 1000);
  if (hoursUntil >= 24 * 14) {
    return {
      cascadeStartHoursBeforeEvent: 5 * 24,
      autoCancelHoursBeforeEvent: 2 * 24,
      nudgeHoursAfterStart: [24, 36, 48, 60],
    };
  }
  if (hoursUntil >= 24 * 7) {
    return {
      cascadeStartHoursBeforeEvent: 5 * 24,
      autoCancelHoursBeforeEvent: 2 * 24,
      nudgeHoursAfterStart: [24, 36, 48],
    };
  }
  if (hoursUntil >= 24 * 3) {
    return {
      cascadeStartHoursBeforeEvent: 3 * 24,
      autoCancelHoursBeforeEvent: 24,
      nudgeHoursAfterStart: [12, 24, 36],
    };
  }
  if (hoursUntil >= 24) {
    return {
      cascadeStartHoursBeforeEvent: 24,
      autoCancelHoursBeforeEvent: 4,
      nudgeHoursAfterStart: [6, 12],
    };
  }
  // <24h — skip the cascade entirely. One-shot invite, auto-cancel in 1h.
  return {
    cascadeStartHoursBeforeEvent: 0, // signal: no cascade
    autoCancelHoursBeforeEvent: 1,
    nudgeHoursAfterStart: [],
  };
}

/**
 * Wipe pending reminders for an invite (sentAt IS NULL) and regenerate
 * based on current event date. Safe to call repeatedly — used both on
 * initial ACCEPTED and on event reschedule.
 */
export async function regenerateInviteReminders(inviteId: string): Promise<{ created: number }> {
  const invite = await prisma.evInvite.findUnique({
    where: { id: inviteId },
    include: {
      event: { select: { id: true, startsAt: true, timezone: true, canceledAt: true } },
    },
  });
  if (!invite || !invite.event) return { created: 0 };
  if (invite.event.canceledAt) return { created: 0 };

  // Only generate the cascade for non-terminal, active-invite statuses.
  const cascadeable = ['ACCEPTED', 'CONFIRMATION_REQUESTED', 'CONFIRMED'];
  if (!cascadeable.includes(invite.status)) return { created: 0 };

  await prisma.evReminder.deleteMany({
    where: { inviteId, sentAt: null },
  });

  const now = new Date();
  const offsets = proximityOffsets(invite.event.startsAt, now);
  const eventStart = invite.event.startsAt.getTime();
  const entries: Array<{
    kind: ReminderKind;
    channel: 'EMAIL' | 'SMS' | 'BOTH';
    at: Date;
  }> = [];

  // Confirmation cascade — only if we still have time for it AND the
  // invite isn't already CONFIRMED (confirmed attendees skip straight to
  // day-before/arrival).
  if (invite.status !== 'CONFIRMED' && offsets.cascadeStartHoursBeforeEvent > 0) {
    const cascadeStart = new Date(eventStart - offsets.cascadeStartHoursBeforeEvent * 3600 * 1000);
    if (cascadeStart > now) {
      entries.push({ kind: 'CONFIRMATION_REQUEST', channel: 'BOTH', at: cascadeStart });
      for (let i = 0; i < offsets.nudgeHoursAfterStart.length; i++) {
        const ts = new Date(
          cascadeStart.getTime() + offsets.nudgeHoursAfterStart[i]! * 3600 * 1000,
        );
        const autoCancelTime = eventStart - offsets.autoCancelHoursBeforeEvent * 3600 * 1000;
        if (ts.getTime() >= autoCancelTime) break;
        const kind: ReminderKind =
          i === 0 ? 'CONFIRMATION_NUDGE_1' : i === 1 ? 'CONFIRMATION_NUDGE_2' : 'CUSTOM';
        entries.push({ kind, channel: i < 2 ? 'BOTH' : 'SMS', at: ts });
      }
      // Auto-cancel marker — the dispatcher treats AUTO_CANCEL_NOTICE as
      // "this is the deadline, flip the invite if no confirm".
      entries.push({
        kind: 'AUTO_CANCEL_NOTICE',
        channel: 'EMAIL',
        at: new Date(eventStart - offsets.autoCancelHoursBeforeEvent * 3600 * 1000),
      });
    }
  }

  // Day-before + arrival — generate regardless of current status so
  // they're ready once the invite moves to CONFIRMED. The dispatcher
  // filters out irrelevant reminders at send time (e.g. skips DAY_BEFORE
  // if status != CONFIRMED at T-1d).
  const dayBefore = new Date(eventStart - 24 * 3600 * 1000);
  if (dayBefore > now) {
    entries.push({ kind: 'DAY_BEFORE', channel: 'BOTH', at: dayBefore });
  }
  const arrival = new Date(eventStart - 4 * 3600 * 1000);
  if (arrival > now) {
    entries.push({ kind: 'ARRIVAL_DETAILS', channel: 'BOTH', at: arrival });
  }

  if (entries.length === 0) return { created: 0 };

  await prisma.evReminder.createMany({
    data: entries.map((e) => ({
      inviteId,
      eventId: invite.event!.id,
      kind: e.kind,
      channel: e.channel,
      scheduledFor: e.at,
      deliveryStatus: 'pending',
    })),
  });

  return { created: entries.length };
}

/** Wipe all pending reminders for an invite (used on decline/cancel/no-show). */
export async function cancelPendingReminders(inviteId: string): Promise<void> {
  await prisma.evReminder.updateMany({
    where: { inviteId, sentAt: null },
    data: { deliveryStatus: 'canceled' },
  });
}

/**
 * Schedule host setup reminders for a sub-event of kind=SETUP
 * (SPEC_EVENTS §2.7). Idempotent — wipes pending SETUP reminders for
 * the sub-event and creates fresh ones at T-4h and T-1h before the
 * sub-event's startsAt. No-ops for non-SETUP sub-events.
 */
export async function regenerateSubEventSetupReminders(subEventId: string): Promise<{
  created: number;
}> {
  const sub = await prisma.evSubEvent.findUnique({
    where: { id: subEventId },
    select: {
      id: true,
      kind: true,
      eventId: true,
      startsAt: true,
      event: { select: { canceledAt: true } },
    },
  });
  if (!sub || sub.kind !== 'SETUP') return { created: 0 };
  if (sub.event.canceledAt) return { created: 0 };

  // Wipe prior pending SETUP reminders for this sub-event.
  await prisma.evReminder.deleteMany({
    where: {
      subEventId: sub.id,
      sentAt: null,
      kind: { in: ['SETUP_T_MINUS_4H', 'SETUP_T_MINUS_1H'] },
    },
  });

  const now = new Date();
  const start = sub.startsAt.getTime();
  const tMinus4h = new Date(start - 4 * 3600 * 1000);
  const tMinus1h = new Date(start - 1 * 3600 * 1000);

  const entries: Array<{ kind: 'SETUP_T_MINUS_4H' | 'SETUP_T_MINUS_1H'; at: Date }> = [];
  if (tMinus4h > now) entries.push({ kind: 'SETUP_T_MINUS_4H', at: tMinus4h });
  if (tMinus1h > now) entries.push({ kind: 'SETUP_T_MINUS_1H', at: tMinus1h });
  if (entries.length === 0) return { created: 0 };

  await prisma.evReminder.createMany({
    data: entries.map((e) => ({
      eventId: sub.eventId,
      subEventId: sub.id,
      kind: e.kind,
      channel: 'EMAIL',
      scheduledFor: e.at,
      deliveryStatus: 'pending',
    })),
  });
  return { created: entries.length };
}

/** Wipe pending setup reminders for a sub-event (on delete/reschedule). */
export async function cancelSubEventSetupReminders(subEventId: string): Promise<void> {
  await prisma.evReminder.updateMany({
    where: {
      subEventId,
      sentAt: null,
      kind: { in: ['SETUP_T_MINUS_4H', 'SETUP_T_MINUS_1H'] },
    },
    data: { deliveryStatus: 'canceled' },
  });
}

// Silence unused ref if caller doesn't use it
void Prisma;
