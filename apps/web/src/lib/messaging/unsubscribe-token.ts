/**
 * HMAC-signed tokens for the public /unsubscribe link.
 *
 * Payload: { contactId, address, issuedAt }. Signed with a shared
 * secret so a guessing attack can't unsubscribe random contacts.
 *
 * Tokens don't expire — CAN-SPAM §7.5 requires an unsubscribe link to
 * work for at least 30 days, and in practice these wind up in inboxes
 * that live forever. Keeping them non-expiring is simpler and safer.
 */

import crypto from 'crypto';

interface TokenPayload {
  contactId: string;
  address: string; // email address being unsubscribed
  iat: number; // unix ms
}

/** Secret material — prefer a dedicated env, fall back to NEXTAUTH_SECRET. */
function secret(): string {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    // Last-resort default. Any prod deploy will have NEXTAUTH_SECRET set,
    // so this path only hits local dev.
    'unsubscribe-dev-fallback'
  );
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

export function signUnsubscribeToken(contactId: string, address: string): string {
  const payload: TokenPayload = {
    contactId,
    address,
    iat: Date.now(),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { ok: true; contactId: string; address: string } | { ok: false; reason: string } {
  if (!token || !token.includes('.')) return { ok: false, reason: 'malformed' };
  const [body, sig] = token.split('.');
  if (!body || !sig) return { ok: false, reason: 'malformed' };

  const expected = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
  // Timing-safe compare — constant-time against signature oracle.
  const expBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(sig);
  if (expBuf.length !== gotBuf.length || !crypto.timingSafeEqual(expBuf, gotBuf)) {
    return { ok: false, reason: 'bad_signature' };
  }

  try {
    const parsed = JSON.parse(b64urlDecode(body).toString('utf8')) as TokenPayload;
    if (!parsed.contactId || !parsed.address) return { ok: false, reason: 'missing_fields' };
    return { ok: true, contactId: parsed.contactId, address: parsed.address };
  } catch {
    return { ok: false, reason: 'parse_error' };
  }
}

/**
 * Build the public unsubscribe URL. We keep this in one place so the
 * email template footer and any other callers stay in sync.
 */
export function unsubscribeUrl(contactId: string, address: string): string {
  const base =
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    'https://partner-crm-production.up.railway.app';
  const token = signUnsubscribeToken(contactId, address);
  return `${base.replace(/\/$/, '')}/unsubscribe?token=${encodeURIComponent(token)}`;
}
