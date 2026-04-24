/**
 * Event invite dispatcher.
 *
 * Sends the initial invite message to an EvInvite — email via Resend
 * (always) and SMS via Twilio (Phase 8.1, currently dry-runs with a
 * clear outcome). Both channels degrade gracefully without creds.
 *
 * RSVP link shape: {APP_BASE_URL}/rsvp/{rsvpToken}
 *
 * Consent model: event invites count as transactional under the same
 * rubric as appointment reminders in SPEC.md §7.5. We still respect
 * per-contact unsubscribe for Partner invitees. Ad-hoc invitees have
 * no consent record and send freely (organizer took responsibility
 * for having a relationship when they typed the email in).
 */

import { prisma } from '@partnerradar/db';
import { sendEmail, renderEmailLayout } from '@partnerradar/integrations';
import { tenant } from '@partnerradar/config';

function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    'https://partner-crm-production.up.railway.app'
  );
}

export async function dispatchEventInvite(args: { inviteId: string }): Promise<{
  ok: boolean;
  email?: 'sent' | 'skipped' | 'no-address';
  sms?: 'dry-run' | 'no-address' | 'not-configured';
  detail?: string;
}> {
  const invite = await prisma.evInvite.findUnique({
    where: { id: args.inviteId },
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
          emailSubject: true,
          smsBodyTemplate: true,
        },
      },
      partner: {
        select: {
          id: true,
          companyName: true,
          contacts: {
            orderBy: { isPrimary: 'desc' },
            select: {
              id: true,
              name: true,
              emails: true,
              phones: true,
              emailConsent: true,
              smsConsent: true,
            },
          },
        },
      },
      ticketAssignments: {
        include: {
          ticketType: { select: { id: true, name: true, isPrimary: true } },
        },
      },
    },
  });
  if (!invite) return { ok: false, detail: 'invite_not_found' };

  const event = invite.event;
  const rsvpUrl = `${appBaseUrl()}/rsvp/${invite.rsvpToken}`;
  const recipientName = invite.partner?.contacts[0]?.name ?? invite.adHocName ?? 'there';
  const firstName = recipientName.split(/\s+/)[0] ?? recipientName;
  const subject =
    event.emailSubject?.replace(/\{\{event\.name\}\}/gi, event.name) ??
    `You're invited: ${event.name}`;
  const ticketsList = invite.ticketAssignments
    .map((a) => `${a.ticketType.name}${a.quantity > 1 ? ` × ${a.quantity}` : ''}`)
    .join(', ');

  // Resolve email + phone.
  const email =
    invite.adHocEmail ||
    (() => {
      const contact = invite.partner?.contacts.find((c) => c.emailConsent !== false);
      if (!contact) return null;
      const emails = Array.isArray(contact.emails)
        ? (contact.emails as Array<{ address?: string; unsubscribedAt?: string | null }>)
        : [];
      const addr = emails.find((e) => e.address && !e.unsubscribedAt)?.address;
      return addr ?? null;
    })();
  const phone =
    invite.adHocPhone ||
    (() => {
      const contact = invite.partner?.contacts.find((c) => c.smsConsent !== false);
      if (!contact) return null;
      const phones = Array.isArray(contact.phones)
        ? (contact.phones as Array<{ number?: string }>)
        : [];
      return phones[0]?.number ?? null;
    })();

  const t = tenant();
  const emailBody = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>You're invited to <strong>${escapeHtml(event.name)}</strong>.</p>
    ${event.description ? `<p>${escapeHtml(event.description).replace(/\n/g, '<br>')}</p>` : ''}
    <table style="border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">When</td><td>${formatWhen(event.startsAt, event.timezone)}</td></tr>
      ${event.venueName ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Where</td><td>${escapeHtml(event.venueName)}${event.venueAddress ? `<br><span style="color:#6b7280;font-size:12px;">${escapeHtml(event.venueAddress)}</span>` : ''}</td></tr>` : ''}
      ${ticketsList ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Includes</td><td>${escapeHtml(ticketsList)}</td></tr>` : ''}
    </table>
    <p>Tap below to let us know if you can make it.</p>
  `;
  const html = renderEmailLayout({
    title: event.name,
    preheader: `RSVP by ${formatTime(invite.expiresAt ?? event.startsAt, event.timezone)}`,
    bodyHtml: emailBody,
    ctaLabel: 'RSVP',
    ctaHref: rsvpUrl,
    footerHtml: `${escapeHtml(t.legalName)} · ${escapeHtml(t.physicalAddress)}<br>This is an event invitation from Partner Portal.`,
  });

  let emailResult: 'sent' | 'skipped' | 'no-address' = 'skipped';
  if (email) {
    const res = await sendEmail({
      to: email,
      subject,
      html,
      text: `You're invited to ${event.name}.\nWhen: ${formatWhen(event.startsAt, event.timezone)}\n${event.venueName ? `Where: ${event.venueName}\n` : ''}RSVP: ${rsvpUrl}\n\n${t.legalName} · ${t.physicalAddress}`,
      tag: `event-invite-${event.id}`,
    });
    if (res.ok) {
      emailResult = 'sent';
      await prisma.evInvite.update({
        where: { id: invite.id },
        data: { lastEmailMessageId: res.id ?? null },
      });
    } else {
      emailResult = 'skipped';
    }
  } else {
    emailResult = 'no-address';
  }

  // SMS — dry-run until Twilio wires up in Phase 8.1.
  let smsResult: 'dry-run' | 'no-address' | 'not-configured' = 'no-address';
  if (phone) {
    if (!process.env.TWILIO_AUTH_TOKEN) {
      smsResult = 'not-configured';
      console.info('[event-invite] SMS dry-run to', phone, 'for event', event.name);
    } else {
      smsResult = 'dry-run'; // TODO(EV-4/phase8): swap for real Twilio send
    }
  }

  return { ok: true, email: emailResult, sms: smsResult };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function formatWhen(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
function formatTime(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
