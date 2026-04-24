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
import { signTicketToken } from '@/lib/events/qr';

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

  // SETUP reminders are for hosts on a sub-event, not invitees.
  if (reminder.kind === 'SETUP_T_MINUS_4H' || reminder.kind === 'SETUP_T_MINUS_1H') {
    return handleSetupReminder(reminder);
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
      ticketAssignments: {
        where: { status: 'CONFIRMED' },
        include: {
          ticketType: { select: { id: true, name: true, isPrimary: true } },
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
  const arrivalUrl = buildArrivalUrl(invite.rsvpToken);
  const recipientName = invite.partner?.contacts[0]?.name ?? invite.adHocName ?? 'there';
  const firstName = recipientName.split(/\s+/)[0] ?? recipientName;
  const tickets = invite.ticketAssignments.map((a) => ({
    assignmentId: a.id,
    name: a.ticketType.name,
    isPrimary: a.ticketType.isPrimary,
    qrUrl: buildQrUrl({
      eventId: invite.event.id,
      assignmentId: a.id,
      inviteId: invite.id,
      ticketTypeId: a.ticketType.id,
    }),
  }));
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
    arrivalUrl,
    plusOneName: invite.plusOneName,
    tickets,
  });

  // ARRIVAL_DETAILS sends the arrival deep-link as CTA; everything else
  // keeps the RSVP link so invitees can still change their answer.
  const ctaHref =
    reminder.kind === 'ARRIVAL_DETAILS' || reminder.kind === 'DAY_BEFORE' ? arrivalUrl : rsvpUrl;

  const res = await sendEmail({
    to: email,
    subject: composed.subject,
    html: renderEmailLayout({
      title: composed.subject,
      preheader: composed.preheader,
      bodyHtml: composed.bodyHtml,
      ctaLabel: composed.ctaLabel,
      ctaHref,
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
  arrivalUrl: string;
  plusOneName: string | null;
  tickets: Array<{ assignmentId: string; name: string; isPrimary: boolean; qrUrl: string }>;
}): {
  subject: string;
  preheader: string;
  bodyHtml: string;
  ctaLabel: string;
  textFallback: string;
} {
  const when = formatWhen(args.startsAt, args.timezone);
  const place = [args.venueName, args.venueAddress].filter(Boolean).join(' · ');
  const plusOneLine = args.plusOneName
    ? `<p style="margin-top:8px;color:#4b5563;font-size:13px;">Plus-one: ${escapeHtml(args.plusOneName)}</p>`
    : '';
  const ticketList = args.tickets.length
    ? `<p style="margin-top:12px;"><strong>Your tickets:</strong> ${args.tickets.map((tt) => escapeHtml(tt.name)).join(', ')}</p>`
    : '';
  const ticketsWithQr = args.tickets.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">${args.tickets
        .map(
          (tt) => `
            <tr>
              <td style="padding:6px 12px 6px 0;vertical-align:middle;">
                <img src="${tt.qrUrl}" alt="${escapeHtml(tt.name)} QR" width="120" height="120" style="border:1px solid #e5e7eb;border-radius:8px;background:#fff;"/>
              </td>
              <td style="padding:6px 0;vertical-align:middle;">
                <div style="font-size:15px;font-weight:600;color:#111827;">${escapeHtml(tt.name)}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:2px;">Scan at check-in</div>
              </td>
            </tr>`,
        )
        .join('')}</table>`
    : '';

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
        bodyHtml: `<p>Hi ${escapeHtml(args.firstName)},</p>
<p>Looking forward to seeing you tomorrow at <strong>${escapeHtml(args.eventName)}</strong>.</p>
<p><strong>When</strong>: ${escapeHtml(when)}${place ? `<br><strong>Where</strong>: ${escapeHtml(place)}` : ''}</p>
${plusOneLine}
${ticketsWithQr}
<p>Tap the button below for the full arrival page — map, parking, host contacts — so you're not hunting through email tomorrow.</p>`,
        ctaLabel: 'Arrival details',
        textFallback: `See you tomorrow at ${args.eventName} (${when}). Arrival details: ${args.arrivalUrl}`,
      };
    case 'ARRIVAL_DETAILS':
      return {
        subject: `Arrival details — ${args.eventName}`,
        preheader: `Starts at ${when}`,
        bodyHtml: `<p>Hi ${escapeHtml(args.firstName)},</p>
<p>You're on in a few hours. Here's everything you need:</p>
<p><strong>${escapeHtml(args.eventName)}</strong><br><strong>When</strong>: ${escapeHtml(when)}${place ? `<br><strong>Where</strong>: ${escapeHtml(place)}` : ''}</p>
${plusOneLine}
${ticketsWithQr}
${ticketList}
<p>Tap below for map, parking, and your host's phone number.</p>`,
        ctaLabel: 'Full arrival page',
        textFallback: `Arrival details for ${args.eventName}: ${when}. Map + parking + hosts: ${args.arrivalUrl}`,
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

function buildArrivalUrl(token: string): string {
  const base =
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    'https://partner-crm-production.up.railway.app';
  return `${base.replace(/\/$/, '')}/arrival?token=${encodeURIComponent(token)}`;
}

function buildQrUrl(args: {
  eventId: string;
  assignmentId: string;
  inviteId: string;
  ticketTypeId: string;
}): string {
  const base =
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    'https://partner-crm-production.up.railway.app';
  const token = signTicketToken(args);
  return `${base.replace(/\/$/, '')}/api/events/${args.eventId}/qr/${args.assignmentId}?token=${encodeURIComponent(token)}`;
}

/**
 * SETUP reminders go to the hosts of a sub-event with kind=SETUP,
 * not invitees. We resolve the sub-event → hosts via the EvHost
 * subEventFocus linkage (or, if empty, fall back to all event hosts).
 */
async function handleSetupReminder(reminder: {
  id: string;
  kind: string;
  eventId: string;
  subEventId: string | null;
}): Promise<{ outcome: Outcome; detail?: string }> {
  if (!reminder.subEventId) {
    await markReminder(reminder.id, 'canceled', 'no_sub_event');
    return { outcome: 'skipped', detail: 'no_sub_event' };
  }

  const subEvent = await prisma.evSubEvent.findUnique({
    where: { id: reminder.subEventId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          venueName: true,
          venueAddress: true,
          timezone: true,
          hosts: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!subEvent) {
    await markReminder(reminder.id, 'failed', 'sub_event_missing');
    return { outcome: 'failed' };
  }

  const when = formatWhen(subEvent.startsAt, subEvent.event.timezone);
  const place = [subEvent.event.venueName, subEvent.event.venueAddress].filter(Boolean).join(' · ');
  const subject =
    reminder.kind === 'SETUP_T_MINUS_4H'
      ? `Setup in 4 hours — ${subEvent.event.name}`
      : `Setup in 1 hour — ${subEvent.event.name}`;
  const t = tenant();

  const hosts = subEvent.event.hosts.filter((h) => h.user.email);
  if (hosts.length === 0) {
    await markReminder(reminder.id, 'canceled', 'no_hosts');
    return { outcome: 'skipped' };
  }

  let failures = 0;
  for (const h of hosts) {
    const firstName = (h.user.name ?? 'there').split(/\s+/)[0] ?? 'there';
    const html = renderEmailLayout({
      title: subject,
      preheader: `Setup begins ${when}`,
      bodyHtml: `<p>Hi ${escapeHtml(firstName)},</p>
<p>${reminder.kind === 'SETUP_T_MINUS_4H' ? 'Heads up — setup is 4 hours out.' : 'Last call — setup starts in an hour.'}</p>
<p><strong>${escapeHtml(subEvent.name)}</strong><br><strong>When</strong>: ${escapeHtml(when)}${place ? `<br><strong>Where</strong>: ${escapeHtml(place)}` : ''}</p>
<p>See you on site.</p>`,
      ctaLabel: 'Open event',
      ctaHref: `${process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? ''}/events/${subEvent.event.id}`,
      footerHtml: `${escapeHtml(t.legalName)} · ${escapeHtml(t.physicalAddress)}`,
    });
    const res = await sendEmail({
      to: h.user.email!,
      subject,
      html,
      text: `${subject}\n${when}${place ? `\n${place}` : ''}`,
      tag: `event-${reminder.kind.toLowerCase()}`,
    });
    if (!res.ok) failures++;
  }

  await prisma.evReminder.update({
    where: { id: reminder.id },
    data: {
      sentAt: new Date(),
      deliveryStatus: failures === hosts.length ? 'failed' : 'sent',
    },
  });
  return { outcome: failures === hosts.length ? 'failed' : 'sent' };
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
