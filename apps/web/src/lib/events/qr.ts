/**
 * QR token + PNG generation for event check-in (SPEC_EVENTS §11.2).
 *
 * Token format: base64url of JSON `{ aid, iid, tt, iat }.sig`
 *   aid = EvTicketAssignment.id
 *   iid = EvInvite.id (redundant but convenient for scanners)
 *   tt  = EvTicketType.id
 *   iat = unix ms
 *   sig = HMAC-SHA256 over the body, using an event-specific secret
 *
 * The event-specific secret is derived from EvEvent.id + NEXTAUTH_SECRET
 * so a leaked token for one event can't forge a token for another.
 *
 * We keep tokens stateless on purpose — the check-in UI verifies
 * signature + cross-checks the assignment row in one DB hit. No token
 * store means no extra table to expire.
 */

import crypto from 'crypto';

function globalSecret(): string {
  return process.env.EVENT_QR_SECRET || process.env.NEXTAUTH_SECRET || 'partnerradar-dev-qr-secret';
}

function eventSecret(eventId: string): Buffer {
  // HKDF-lite — use the event id as a salt into the master secret so
  // every event gets its own key without needing a per-event env var.
  return crypto.createHmac('sha256', globalSecret()).update(`event:${eventId}`).digest();
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4 || 4);
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad === 4 ? 0 : pad);
  return Buffer.from(padded, 'base64');
}

interface Payload {
  aid: string;
  iid: string;
  tt: string;
  iat: number;
}

export function signTicketToken(args: {
  eventId: string;
  assignmentId: string;
  inviteId: string;
  ticketTypeId: string;
}): string {
  const body: Payload = {
    aid: args.assignmentId,
    iid: args.inviteId,
    tt: args.ticketTypeId,
    iat: Date.now(),
  };
  const bodyB64 = b64url(JSON.stringify(body));
  const sig = b64url(
    crypto.createHmac('sha256', eventSecret(args.eventId)).update(bodyB64).digest(),
  );
  return `${bodyB64}.${sig}`;
}

export function verifyTicketToken(
  eventId: string,
  token: string,
):
  | { ok: true; assignmentId: string; inviteId: string; ticketTypeId: string; issuedAt: number }
  | { ok: false; reason: string } {
  if (!token || !token.includes('.')) return { ok: false, reason: 'malformed' };
  const [body, sig] = token.split('.');
  if (!body || !sig) return { ok: false, reason: 'malformed' };
  const expected = b64url(crypto.createHmac('sha256', eventSecret(eventId)).update(body).digest());
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }
  try {
    const parsed = JSON.parse(b64urlDecode(body).toString('utf8')) as Payload;
    if (!parsed.aid || !parsed.iid || !parsed.tt) {
      return { ok: false, reason: 'missing_fields' };
    }
    return {
      ok: true,
      assignmentId: parsed.aid,
      inviteId: parsed.iid,
      ticketTypeId: parsed.tt,
      issuedAt: parsed.iat,
    };
  } catch {
    return { ok: false, reason: 'parse_error' };
  }
}

/**
 * Render a QR PNG for a signed ticket token. Returns a Buffer so the
 * API route can stream it directly.
 *
 * Size: 200x200 is the SPEC default. We use error-correction level M
 * which is the sweet spot for scannability on a phone screen (L is
 * flakier in low light, H bloats the image).
 */
export async function renderTicketQrPng(token: string): Promise<Buffer> {
  const qrcode = await import('qrcode');
  const buffer = await qrcode.toBuffer(token, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
  });
  return buffer;
}
