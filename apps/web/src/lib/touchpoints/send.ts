/**
 * Send a single Touchpoint — pulls the partner/contact, renders the
 * default congrats message if none was customized, fires the channel
 * (SMS via Twilio, EMAIL via Resend, MANUAL = no-op), and updates the
 * Touchpoint row to SENT/FAILED.
 *
 * The cron tick at /api/cron/touchpoints-tick walks every SCHEDULED
 * row whose scheduledFor <= now and calls this. The /touchpoints UI
 * also calls it directly when the rep clicks "Send now".
 *
 * Twilio is wired through TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
 * TWILIO_FROM. If any are missing, SMS sends are logged + status
 * stays SCHEDULED so a future configured cron run can retry.
 */

import { prisma } from '@partnerradar/db';
import { sendEmail } from '@partnerradar/integrations';

interface PartnerContext {
  companyName: string;
}
interface ContactContext {
  name: string;
}

function renderMessage(
  kind: 'BIRTHDAY' | 'BUSINESS_ANNIVERSARY' | 'PARTNERSHIP_MILESTONE',
  meta: Record<string, unknown>,
  partner: PartnerContext,
  contact: ContactContext | null,
  fromName: string,
  tenantName: string,
): { subject: string; body: string } {
  const fn = (contact?.name ?? '').split(' ')[0] || 'friend';
  const company = partner.companyName;
  const tenant = tenantName;
  const sender = fromName || tenant;
  const years = typeof meta.years === 'number' ? meta.years : null;
  switch (kind) {
    case 'BIRTHDAY':
      return {
        subject: `Happy birthday, ${fn}!`,
        body: `Happy birthday, ${fn}! Hope you have a great day. — ${sender}${tenant && tenant !== sender ? ` @ ${tenant}` : ''}`,
      };
    case 'BUSINESS_ANNIVERSARY':
      return {
        subject: `Happy anniversary, ${company}!`,
        body: `Congrats on another year of ${company}! 🎉 — ${sender}`,
      };
    case 'PARTNERSHIP_MILESTONE': {
      const yLabel = years === 1 ? '1 year' : `${years} years`;
      return {
        subject: `${yLabel} of partnership 🎉`,
        body: `Today marks ${yLabel} of working together with ${company}. Thanks for being a great partner! — ${sender}`,
      };
    }
  }
}

async function sendTwilioSms(
  to: string,
  body: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    console.info('[touchpoint sms] Twilio not configured — dry-run', {
      to,
      body: body.slice(0, 60),
    });
    return { ok: false, error: 'twilio_not_configured' };
  }
  // Twilio Messages API. Dropping the official SDK keeps the install
  // light + matches the fetch-based pattern we use for Resend.
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${auth}`,
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `twilio ${res.status}: ${txt.slice(0, 200)}` };
    }
    const data = (await res.json()) as { sid?: string };
    return { ok: true, id: data.sid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'send failed' };
  }
}

export interface TouchpointSendResult {
  ok: boolean;
  outcome: 'SENT' | 'FAILED' | 'SKIPPED';
  detail?: string;
}

export async function sendTouchpoint(touchpointId: string): Promise<TouchpointSendResult> {
  const tp = await prisma.touchpoint.findUnique({ where: { id: touchpointId } });
  if (!tp) return { ok: false, outcome: 'FAILED', detail: 'not found' };
  if (tp.status === 'SENT') return { ok: true, outcome: 'SENT', detail: 'already sent' };
  if (tp.status === 'CANCELED') return { ok: false, outcome: 'SKIPPED', detail: 'canceled' };

  const partner = await prisma.partner.findUnique({
    where: { id: tp.partnerId },
    select: {
      id: true,
      companyName: true,
      smsConsent: true,
      emailUnsubscribedAt: true,
      market: { select: { tenant: { select: { name: true, fromAddress: true } } } },
      contacts: {
        where: tp.contactId ? { id: tp.contactId } : { isPrimary: true },
        select: {
          id: true,
          name: true,
          phones: true,
          emails: true,
          smsConsent: true,
          emailConsent: true,
        },
        take: 1,
      },
    },
  });
  if (!partner) return finalize(touchpointId, 'FAILED', 'partner missing');
  const contact = partner.contacts[0] ?? null;

  const tenantName = partner.market?.tenant?.name ?? 'Partner Portal';
  const fromAddress = partner.market?.tenant?.fromAddress ?? undefined;
  const meta = (tp.meta as Record<string, unknown>) ?? {};
  const rendered = renderMessage(
    tp.kind,
    meta,
    { companyName: partner.companyName },
    contact ? { name: contact.name } : null,
    tenantName,
    tenantName,
  );
  const body = tp.message?.trim() ? tp.message : rendered.body;

  // MANUAL channel: just log it as SENT so the row drops off the
  // upcoming list. The rep already reached out themselves.
  if (tp.channel === 'MANUAL') {
    return finalize(touchpointId, 'SENT', 'manual');
  }

  if (tp.channel === 'SMS') {
    if (!contact || !partner.smsConsent || !contact.smsConsent) {
      return finalize(touchpointId, 'FAILED', 'no SMS consent');
    }
    const phone = (
      contact.phones as Array<{ number?: string; primary?: boolean }> | undefined
    )?.find((p) => p?.number)?.number;
    if (!phone) return finalize(touchpointId, 'FAILED', 'no phone');
    const res = await sendTwilioSms(phone, body);
    if (res.ok) return finalize(touchpointId, 'SENT', `twilio ${res.id ?? ''}`.trim());
    return finalize(touchpointId, 'FAILED', res.error);
  }

  if (tp.channel === 'EMAIL') {
    if (partner.emailUnsubscribedAt) return finalize(touchpointId, 'FAILED', 'unsubscribed');
    const email = (
      contact?.emails as Array<{ address?: string; primary?: boolean }> | undefined
    )?.find((e) => e?.address)?.address;
    if (!email) return finalize(touchpointId, 'FAILED', 'no email');
    const res = await sendEmail({
      to: email,
      subject: rendered.subject,
      html: `<p>${escapeHtml(body)}</p>`,
      text: body,
      fromEmail: fromAddress,
      tag: `touchpoint-${tp.kind.toLowerCase()}`,
    });
    if (res.ok) return finalize(touchpointId, 'SENT', `resend ${res.id ?? ''}`.trim());
    return finalize(touchpointId, 'FAILED', res.error ?? res.skipped ?? 'unknown');
  }

  return finalize(touchpointId, 'FAILED', `unknown channel ${tp.channel}`);
}

async function finalize(
  id: string,
  outcome: 'SENT' | 'FAILED' | 'SKIPPED',
  detail?: string,
): Promise<TouchpointSendResult> {
  const status = outcome === 'SENT' ? 'SENT' : outcome === 'SKIPPED' ? 'SKIPPED' : 'FAILED';
  await prisma.touchpoint
    .update({
      where: { id },
      data: {
        status,
        sentAt: status === 'SENT' ? new Date() : null,
        errorMessage: status === 'FAILED' ? (detail ?? null) : null,
      },
    })
    .catch(() => {});
  return { ok: status === 'SENT', outcome, detail };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
