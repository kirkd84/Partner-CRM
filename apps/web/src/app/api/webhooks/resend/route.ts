/**
 * Resend webhook receiver — backfill delivery + bounce signals.
 *
 * The pixel + click-tracker handle opens/clicks regardless of webhook
 * status; this endpoint fills in the rest:
 *   - email.delivered  → stamps deliveredAt on the recipient row
 *   - email.opened     → stamps openedAt (mirrors the pixel signal so
 *                        clients that block images still register an open)
 *   - email.clicked    → stamps firstClickedAt (mirrors click tracker)
 *   - email.bounced    → stamps bouncedAt + reason; sets
 *                        Partner.emailUnsubscribedAt if hard-bounce
 *                        so we stop emailing them.
 *   - email.complained → spam complaint = treat like an unsubscribe.
 *
 * Webhook config: in Resend, point at /api/webhooks/resend and set the
 * webhook secret to RESEND_WEBHOOK_SECRET. We verify the Svix-style
 * signature header (svix-id + svix-timestamp + svix-signature) when
 * the secret is set; otherwise we accept all (dev mode).
 *
 * If the webhook receives an event for a resendId we don't recognize,
 * we 200 silently — Resend retries on non-2xx, and an unknown id is
 * almost always an old test mail or a one-off transactional that we
 * deliberately don't track.
 */

import { prisma } from '@partnerradar/db';
import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ResendWebhookEvent {
  type?: string;
  data?: {
    email_id?: string;
    bounce?: { type?: string; message?: string };
    [k: string]: unknown;
  };
}

function verifySvixSignature(body: string, headers: Headers, secret: string): boolean {
  const svixId = headers.get('svix-id');
  const svixTs = headers.get('svix-timestamp');
  const svixSig = headers.get('svix-signature');
  if (!svixId || !svixTs || !svixSig) return false;
  // Resend uses the same scheme as Svix: signed payload =
  // `${id}.${timestamp}.${rawBody}` with HMAC-SHA256, then base64.
  // The signature header contains space-separated `v1,<sig>` entries.
  const cleanedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(cleanedSecret, 'base64');
  } catch {
    return false;
  }
  const signed = `${svixId}.${svixTs}.${body}`;
  const expected = createHmac('sha256', secretBytes).update(signed).digest('base64');
  for (const part of svixSig.split(' ')) {
    const [, sig] = part.split(',');
    if (!sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // continue
    }
  }
  return false;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    if (!verifySvixSignature(raw, req.headers, secret)) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  }
  let evt: ResendWebhookEvent;
  try {
    evt = JSON.parse(raw) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const resendId = evt.data?.email_id;
  if (!evt.type || !resendId) {
    return NextResponse.json({ ok: true, ignored: 'no type/id' });
  }
  const rec = await prisma.newsletterRecipient.findFirst({
    where: { resendId },
    select: {
      id: true,
      newsletterId: true,
      partnerId: true,
      deliveredAt: true,
      openedAt: true,
      firstClickedAt: true,
      bouncedAt: true,
    },
  });
  if (!rec) {
    // Unknown — old test send, transactional email, etc.
    return NextResponse.json({ ok: true, ignored: 'unknown recipient' });
  }
  const now = new Date();
  const recUpdate: Record<string, unknown> = {};
  const newsletterUpdate: Record<string, { increment: number }> = {};

  switch (evt.type) {
    case 'email.delivered':
      if (!rec.deliveredAt) recUpdate.deliveredAt = now;
      break;
    case 'email.opened':
      if (!rec.openedAt) {
        recUpdate.openedAt = now;
        newsletterUpdate.openCount = { increment: 1 };
      }
      break;
    case 'email.clicked':
      if (!rec.firstClickedAt) {
        recUpdate.firstClickedAt = now;
        if (!rec.openedAt) recUpdate.openedAt = now;
        newsletterUpdate.clickCount = { increment: 1 };
      }
      break;
    case 'email.bounced':
    case 'email.complained': {
      if (!rec.bouncedAt) {
        recUpdate.bouncedAt = now;
        const reason =
          evt.type === 'email.complained'
            ? 'complaint'
            : (evt.data?.bounce?.message ?? evt.data?.bounce?.type ?? 'bounced');
        recUpdate.bounceReason = String(reason).slice(0, 200);
        // Hard-bounce → mark the partner as unsubscribed so we stop
        // emailing them from any newsletter / drip / cadence. We
        // intentionally do this for soft bounces too — better to
        // pause than to keep hitting a dead address.
        await prisma.partner
          .update({
            where: { id: rec.partnerId },
            data: { emailUnsubscribedAt: now },
          })
          .catch(() => {});
      }
      break;
    }
    default:
      return NextResponse.json({ ok: true, ignored: `unhandled ${evt.type}` });
  }

  if (Object.keys(recUpdate).length > 0) {
    await prisma.newsletterRecipient.update({
      where: { id: rec.id },
      data: recUpdate,
    });
  }
  if (Object.keys(newsletterUpdate).length > 0) {
    await prisma.newsletter
      .update({
        where: { id: rec.newsletterId },
        data: newsletterUpdate,
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
