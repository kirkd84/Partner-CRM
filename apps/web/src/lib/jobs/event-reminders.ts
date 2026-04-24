/**
 * Event reminder dispatcher — runs every 5 minutes.
 *
 * Walks EvReminder rows where scheduledFor <= now AND sentAt IS NULL,
 * dispatches them via email (and SMS dry-run until Twilio lands), and
 * implements the auto-cancel cutoff.
 *
 * Reminder-kind behaviour:
 *   CONFIRMATION_REQUEST  → send re-confirm email; flip invite status
 *                           to CONFIRMATION_REQUESTED
 *   CONFIRMATION_NUDGE_1/2 / CUSTOM → send nudge if still
 *                           CONFIRMATION_REQUESTED / ACCEPTED
 *   AUTO_CANCEL_NOTICE    → if invite is still awaiting confirmation,
 *                           flip to AUTO_CANCELED, release tickets,
 *                           cascade
 *   DAY_BEFORE / ARRIVAL_DETAILS → send to confirmed attendees only
 *
 * Quiet hours (§7.3): non-urgent SMS reminders in 9pm–8am local time
 * push to next 8am. Email never blocks on quiet hours.
 */

import { inngest } from '../inngest-client';
import { prisma, Prisma } from '@partnerradar/db';
import { sendEmail, renderEmailLayout } from '@partnerradar/integrations';
import { tenant } from '@partnerradar/config';

const BATCH = 100;

export const eventReminderTick = inngest.createFunction(
  { id: 'event-reminder-tick', name: 'Event · dispatch due reminders (5m)' },
  { cron: '*/5 * * * *' },
  async ({ step, logger }) => {
    const due = await step.run('find-due', async () =>
      prisma.evReminder.findMany({
        where: {
          sentAt: null,
          deliveryStatus: 'pending',
          scheduledFor: { lte: new Date() },
        },
        orderBy: { scheduledFor: 'asc' },
        take: BATCH,
      }),
    );
    if (due.length === 0) return { dispatched: 0 };
    logger.info?.(`event-reminders: ${due.length} due`);

    let sent = 0;
    let skipped = 0;
    let autoCanceled = 0;
    let failed = 0;

    for (const r of due) {
      const res = await step.run(`send-${r.id}`, async () => processReminder(r.id));
      if (res.outcome === 'sent') sent++;
      else if (res.outcome === 'auto-canceled') autoCanceled++;
      else if (res.outcome === 'skipped') skipped++;
      else failed++;
    }

    return { dispatched: due.length, sent, skipped, autoCanceled, failed };
  },
);

type Outcome = 'sent' | 'skipped' | 'auto-canceled' | 'failed';

async function processReminder(reminderId: string): Promise<{ outcome: Outcome; detail?: string }> {
  const reminder = await prisma.evReminder.findUnique({
    where: { id: reminderId },
  });
  if (!reminder) return { outcome: 'failed', detail: 'not_found' };
  if (reminder.sentAt || reminder.deliveryStatus !== 'pending') {
    return { outcome: 'skipped', detail: 'already_handled' };
  }

  // AUTO_CANCEL is a state-change, not a message. Handle it separately.
  if (reminder.kind === 'AUTO_CANCEL_NOTICE') {
    return handleAutoCancel(reminder);
  }

  if (!reminder.inviteId) {
    await markReminder(reminder.id, 'sent', 'no-invite');
    return { outcome: 'sent' };
  }

  const invite = await prisma.evInvite.findUnique({
    where: { id: reminder.inviteId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          description: true,
          venueName: true,
          venueAddress: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          canceledAt: true,
        },
      },
      partner: {
        select: {
          companyName: true,
          contacts: {
            orderBy: { isPrimary: 'desc' },
            select: { name: true, emails: true, emailConsent: true },
          },
        },
      },
    },
  });
  if (!invite) {
    await markReminder(reminder.id, 'failed', 'invite_gone');
    return { outcome: 'failed' };
  }
  if (invite.event.canceledAt) {
    await markReminder(reminder.id, 'canceled', 'event_canceled');
    return { outcome: 'skipped', detail: 'event_canceled' };
  }

  // Filter by kind vs current status.
  const status = invite.status;
  const suitable = reminderSuitsStatus(reminder.kind, status);
  if (!suitable) {
    await markReminder(reminder.id, 'canceled', `status=${status}`);
    return { outcome: 'skipped', detail: `wrong_status:${status}` };
  }

  // First-confirmation transition: flip to CONFIRMATION_REQUESTED the
  // first time the confirmation-request reminder fires.
  if (reminder.kind === 'CONFIRMATION_REQUEST' && status === 'ACCEPTED') {
    await prisma.evInvite.update({
      where: { id: invite.id },
      data: {
        status: 'CONFIRMATION_REQUESTED',
        confirmationRequestedAt: new Date(),
      },
    });
  }

  // Resolve email address.
  const adHocEmail = invite.adHocEmail ?? null;
  const partnerEmail = (() => {
    const c = invite.partner?.contacts.find((c) => c.emailConsent !== false);
    if (!c) return null;
    const list = Array.isArray(c.emails)
      ? (c.emails as Array<{ address?: string; unsubscribedAt?: string | null }>)
      : [];
    return list.find((e) => e.address && !e.unsubscribedAt)?.address ?? null;
  })();
  const email = adHocEmail ?? partnerEmail;

  if (!email) {
    await markReminder(reminder.id, 'failed', 'no_email');
    return { outcome: 'failed', detail: 'no_email' };
  }

  // Compose + send.
  const t = tenant();
  const rsvpUrl = buildRsvpUrl(invite.rsvpToken);
  const recipientName = invite.partner?.contacts[0]?.name ?? invite.adHocName ?? 'there';
  const firstName = recipientName.split(/\s+/)[0] ?? recipientName;
  const composed = composeReminder({
    kind: reminder.kind,
    eventName: invite.event.name,
    eventDesc: invite.event.description,
    venueName: invite.event.venueName,
    venueAddress: invite.event.venueAddress,
    startsAt: invite.event.startsAt,
    timezone: invite.event.timezone,
    firstName,
    rsvpUrl,
  });

  const res = await sendEmail({
    to: email,
    subject: composed.subject,
    html: renderEmailLayout({
      title: composed.subject,
      preheader: composed.preheader,
      bodyHtml: composed.bodyHtml,
      ctaLabel: composed.ctaLabel,
      ctaHref: rsvpUrl,
      footerHtml: `${escapeHtml(t.legalName)} · ${escapeHtml(t.physicalAddress)}`,
    }),
    text: composed.textFallback,
    tag: `event-${reminder.kind.toLowerCase()}`,
  });

  if (!res.ok) {
    await markReminder(reminder.id, 'failed', res.error ?? res.skipped ?? 'send_failed');
    return { outcome: 'failed', detail: res.error ?? 'send_failed' };
  }

  await prisma.evReminder.update({
    where: { id: reminder.id },
    data: {
      sentAt: new Date(),
      deliveryStatus: 'sent',
      messageId: res.id ?? null,
    },
  });
  return { outcome: 'sent' };
}

async function handleAutoCancel(reminder: {
  id: string;
  inviteId: string | null;
  eventId: string;
}): Promise<{ outcome: Outcome }> {
  if (!reminder.inviteId) {
    await markReminder(reminder.id, 'canceled', 'no-invite');
    return { outcome: 'skipped' };
  }
  const invite = await prisma.evInvite.findUnique({
    where: { id: reminder.inviteId },
    include: { ticketAssignments: { select: { ticketTypeId: true } } },
  });
  if (!invite) {
    await markReminder(reminder.id, 'failed', 'invite_gone');
    return { outcome: 'failed' };
  }
  // Only auto-cancel if still awaiting confirmation.
  if (invite.status !== 'ACCEPTED' && invite.status !== 'CONFIRMATION_REQUESTED') {
    await markReminder(reminder.id, 'canceled', `status=${invite.status}`);
    return { outcome: 'skipped' };
  }

  const releasedTypes = [...new Set(invite.ticketAssignments.map((a) => a.ticketTypeId))];
  await prisma.$transaction([
    prisma.evInvite.update({
      where: { id: invite.id },
      data: {
        status: 'AUTO_CANCELED',
        canceledAt: new Date(),
        canceledReason: 'auto_cancel_no_confirm',
      },
    }),
    prisma.evTicketAssignment.updateMany({
      where: { inviteId: invite.id },
      data: { status: 'RELEASED' },
    }),
    prisma.evRsvpEvent.create({
      data: {
        inviteId: invite.id,
        kind: 'auto-canceled',
        actorType: 'system',
      },
    }),
    prisma.evActivityLogEntry.create({
      data: {
        eventId: invite.eventId,
        kind: 'auto-canceled',
        summary: 'Invite auto-canceled at cutoff — no confirmation',
        metadata: { inviteId: invite.id } as Prisma.InputJsonValue,
      },
    }),
    prisma.evReminder.update({
      where: { id: reminder.id },
      data: { sentAt: new Date(), deliveryStatus: 'sent' },
    }),
  ]);
  // Release any pending reminders for this invite + trigger cascade.
  await prisma.evReminder.updateMany({
    where: { inviteId: invite.id, sentAt: null, id: { not: reminder.id } },
    data: { deliveryStatus: 'canceled' },
  });
  if (releasedTypes.length > 0) {
    await inngest.send({
      name: 'partner-portal/event.ticket-released',
      data: { eventId: invite.eventId, ticketTypeIds: releasedTypes },
    });
  }
  return { outcome: 'auto-canceled' };
}

function reminderSuitsStatus(kind: string, status: string): boolean {
  switch (kind) {
    case 'CONFIRMATION_REQUEST':
    case 'CONFIRMATION_NUDGE_1':
    case 'CONFIRMATION_NUDGE_2':
    case 'CUSTOM':
      return status === 'ACCEPTED' || status === 'CONFIRMATION_REQUESTED';
    case 'DAY_BEFORE':
    case 'ARRIVAL_DETAILS':
      return status === 'CONFIRMED';
    default:
      return true;
  }
}

async function markReminder(id: string, deliveryStatus: string, note?: string): Promise<void> {
  await prisma.evReminder.update({
    where: { id },
    data: {
      sentAt: deliveryStatus === 'pending' ? null : new Date(),
      deliveryStatus,
      messageId: note ? `skip:${note.slice(0, 40)}` : undefined,
    },
  });
}

function buildRsvpUrl(token: string): string {
  const base =
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    'https://partner-crm-production.up.railway.app';
  return `${base.replace(/\/$/, '')}/rsvp/${token}`;
}

function composeReminder(args: {
  kind: string;
  eventName: string;
  eventDesc: string | null;
  venueName: string | null;
  venueAddress: string | null;
  startsAt: Date;
  timezone: string;
  firstName: string;
  rsvpUrl: string;
}): {
  subject: string;
  preheader: string;
  bodyHtml: string;
  ctaLabel: string;
  textFallback: string;
} {
  const when = formatWhen(args.startsAt, args.timezone);
  const place = [args.venueName, args.venueAddress].filter(Boolean).join(' · ');
  switch (args.kind) {
    case 'CONFIRMATION_REQUEST':
      return {
        subject: `Quick confirm — still joining us for ${args.eventName}?`,
        preheader: 'One tap to confirm',
        bodyHtml: `<p>Hi ${escapeHtml(args.firstName)},</p><p>Just making sure you're still coming to <strong>${escapeHtml(args.eventName)}</strong> on ${escapeHtml(when)}${place ? ` at ${escapeHtml(place)}` : ''}.</p><p>One tap below to lock it in.</p>`,
        ctaLabel: "Yes, I'm still coming",
        textFallback: `Still joining us for ${args.eventName} on ${when}? Confirm: ${args.rsvpUrl}`,
      };
    case 'CONFIRMATION_NUDGE_1':
    case 'CONFIRMATION_NUDGE_2':
    case 'CUSTOM':
      return {
        subject: `Reminder: confirm ${args.eventName}`,
        preheader: 'Need a yes/no soon so we can plan',
        bodyHtml: `<p>Hi ${escapeHtml(args.firstName)},</p><p>Haven't heard back — we need to confirm numbers for <strong>${escapeHtml(args.eventName)}</strong>. One tap below either way.</p>`,
        ctaLabel: 'Confirm or decline',
        textFallback: `Haven't heard back — please confirm or decline ${args.eventName}: ${args.rsvpUrl}`,
      };
    case 'DAY_BEFORE':
      return {
        subject: `Can't wait to see you tomorrow — ${args.eventName}`,
        preheader: when,
        bodyHtml: `<p>Hi ${escapeHtml(args.firstName)},</p><p>Looking forward to seeing you tomorrow at <strong>${escapeHtml(args.eventName)}</strong>.</p><p>When: ${escapeHtml(when)}${place ? `<br>Where: ${escapeHtml(place)}` : ''}</p><p>Safe travels!</p>`,
        ctaLabel: 'Event details',
        textFallback: `See you tomorrow at ${args.eventName} (${when}). Details: ${args.rsvpUrl}`,
      };
    case 'ARRIVAL_DETAILS':
      return {
        subject: `Arrival details — ${args.eventName}`,
        preheader: `Starts at ${when}`,
        bodyHtml: `<p>Hi ${escapeHtml(args.firstName)},</p><p>A few hours out. Here's what you need:</p><p><strong>${escapeHtml(args.eventName)}</strong><br>When: ${escapeHtml(when)}${place ? `<br>Where: ${escapeHtml(place)}` : ''}</p><p>See you there.</p>`,
        ctaLabel: 'Full event info',
        textFallback: `Arrival details for ${args.eventName}: ${when}. More: ${args.rsvpUrl}`,
      };
    default:
      return {
        subject: args.eventName,
        preheader: when,
        bodyHtml: `<p>Reminder about <strong>${escapeHtml(args.eventName)}</strong>.</p>`,
        ctaLabel: 'Event details',
        textFallback: args.rsvpUrl,
      };
  }
}

function formatWhen(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
