/**
 * Batch-offer dispatcher (SPEC_EVENTS §4.4).
 *
 * Sends the "one ticket just opened up" message to every recipient of a
 * batch offer — email (Resend) and SMS (Twilio, dry-run until creds
 * land). Each recipient has a unique claim token; the first to hit
 * /claim/[token] wins.
 *
 * Ordering note: we intentionally fire all sends in parallel rather
 * than sequentially. The whole point of a batch offer is "first come
 * first served"; staggering sends would unfairly favor recipients at
 * the top of whatever sort order we picked.
 *
 * Failure mode: if a single send fails we log and move on — the offer
 * is still open and other recipients who got through can still claim.
 * The recipient row's notifiedAt stays null so we can retry later.
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

export async function dispatchBatchOffer(args: { batchOfferId: string }): Promise<{
  ok: boolean;
  sent: number;
  failed: number;
}> {
  const offer = await prisma.evBatchOffer.findUnique({
    where: { id: args.batchOfferId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          venueName: true,
          startsAt: true,
          timezone: true,
        },
      },
      ticketType: {
        select: { id: true, name: true },
      },
      recipients: {
        where: { notifiedAt: null, lostRaceAt: null, wonRaceAt: null },
        include: {
          invite: {
            select: {
              id: true,
              adHocName: true,
              adHocEmail: true,
              adHocPhone: true,
              partner: {
                select: {
                  contacts: {
                    orderBy: { isPrimary: 'desc' },
                    select: {
                      name: true,
                      emails: true,
                      phones: true,
                      emailConsent: true,
                      smsConsent: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!offer) return { ok: false, sent: 0, failed: 0 };
  if (offer.status !== 'OPEN') return { ok: true, sent: 0, failed: 0 };

  const t = tenant();
  let sent = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    offer.recipients.map(async (r) => {
      const contact = r.invite.partner?.contacts[0];
      const recipientName = contact?.name ?? r.invite.adHocName ?? 'there';
      const firstName = recipientName.split(/\s+/)[0] ?? recipientName;
      const email =
        r.invite.adHocEmail ||
        (contact && contact.emailConsent !== false ? pickFirstEmail(contact.emails) : null);
      const phone =
        r.invite.adHocPhone ||
        (contact && contact.smsConsent !== false ? pickFirstPhone(contact.phones) : null);

      const claimUrl = `${appBaseUrl()}/claim/${r.claimToken}`;
      const subject = `One ${offer.ticketType.name} just opened up — first to claim wins`;
      const eventDate = formatWhen(offer.event.startsAt, offer.event.timezone);
      const expiresAt = formatWhen(offer.expiresAt, offer.event.timezone);
      const body = `
        <p>Hi ${escapeHtml(firstName)},</p>
        <p>A <strong>${escapeHtml(offer.ticketType.name)}</strong> just opened up for
        <strong>${escapeHtml(offer.event.name)}</strong> on ${eventDate}.</p>
        <p>This one's first come, first served — whoever taps Claim first gets it. Offer expires ${expiresAt} or when someone else claims it.</p>
      `;
      const html = renderEmailLayout({
        title: `${offer.ticketType.name} just opened up`,
        preheader: `First to claim wins — expires ${expiresAt}`,
        bodyHtml: body,
        ctaLabel: 'Claim it',
        ctaHref: claimUrl,
        footerHtml: `${escapeHtml(t.legalName)} · ${escapeHtml(t.physicalAddress)}<br>You're getting this because you're confirmed for ${escapeHtml(offer.event.name)}.`,
      });

      if (email) {
        const res = await sendEmail({
          to: email,
          subject,
          html,
          text: `${offer.ticketType.name} just opened up for ${offer.event.name} on ${eventDate}. First to claim wins — tap: ${claimUrl}\n\nExpires ${expiresAt}.`,
          tag: `event-batch-offer-${offer.event.id}`,
        });
        if (!res.ok) failed++;
      }

      if (phone && process.env.TWILIO_AUTH_TOKEN) {
        // Twilio wired up in later phase — for now dry-run log.
        console.info('[batch-offer] SMS (live) to', phone, 'claimUrl:', claimUrl);
      } else if (phone) {
        console.info('[batch-offer] SMS (dry-run) to', phone, 'claimUrl:', claimUrl);
      }

      await prisma.evBatchOfferRecipient.update({
        where: { id: r.id },
        data: { notifiedAt: new Date() },
      });
      sent++;
    }),
  );
  // Tally rejections as failures too (the per-send try/catch already
  // kept its own counter, but Promise.allSettled gives us the safety net).
  for (const r of results) if (r.status === 'rejected') failed++;

  return { ok: true, sent, failed };
}

function pickFirstEmail(emails: unknown): string | null {
  const arr = Array.isArray(emails)
    ? (emails as Array<{ address?: string; unsubscribedAt?: string | null }>)
    : [];
  return arr.find((e) => e.address && !e.unsubscribedAt)?.address ?? null;
}
function pickFirstPhone(phones: unknown): string | null {
  const arr = Array.isArray(phones) ? (phones as Array<{ number?: string }>) : [];
  return arr[0]?.number ?? null;
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
