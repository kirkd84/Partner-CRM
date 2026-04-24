/**
 * Central consent + quiet-hours gate for automated messages.
 *
 * Every automated send (cadence step, AI auto-draft, bulk follow-up)
 * MUST pass through `checkSendAllowed()` before the network call. That
 * keeps legal compliance in one place — no "oops, we forgot to check
 * the unsubscribe list in the cadence dispatcher" bugs. SPEC §6.7 +
 * §12 (CAN-SPAM / TCPA).
 *
 * What we check, in order:
 *   1. Partner isn't archived.
 *   2. Market timezone's current local hour is inside the quiet-hours
 *      window (default 8am–8pm, configurable via QUIET_HOURS_START /
 *      QUIET_HOURS_END env vars for now).
 *   3. The partner has at least one contact with channel consent:
 *        • email → Contact.emailConsent === true AND at least one
 *          email address without unsubscribedAt.
 *        • sms   → Contact.smsConsent === true AND a phone number.
 *   4. (Caller's responsibility) — rate limits, per-rep sending cap.
 *
 * The returned shape includes the contact + address to dispatch to so
 * callers don't need a second query.
 */

import { prisma } from '@partnerradar/db';

export type Channel = 'email' | 'sms';

export type SendDecision =
  | {
      allowed: true;
      contactId: string;
      contactName: string;
      address: string; // email or phone
      channel: Channel;
    }
  | {
      allowed: false;
      reason:
        | 'partner_archived'
        | 'quiet_hours'
        | 'no_consent_contact'
        | 'no_address'
        | 'partner_not_found';
      detail?: string;
    };

const DEFAULT_QUIET_START = 8; // 08:00 local
const DEFAULT_QUIET_END = 20; // 20:00 local

export async function checkSendAllowed(
  partnerId: string,
  channel: Channel,
  now: Date = new Date(),
): Promise<SendDecision> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      archivedAt: true,
      market: { select: { timezone: true } },
      contacts: {
        select: {
          id: true,
          name: true,
          smsConsent: true,
          emailConsent: true,
          phones: true,
          emails: true,
          isPrimary: true,
        },
      },
    },
  });
  if (!partner) return { allowed: false, reason: 'partner_not_found' };
  if (partner.archivedAt) return { allowed: false, reason: 'partner_archived' };

  if (!inQuietHoursWindow(now, partner.market.timezone)) {
    return {
      allowed: false,
      reason: 'quiet_hours',
      detail: `Market tz: ${partner.market.timezone}`,
    };
  }

  // Prefer the primary contact; fall back to the first with consent.
  const contacts = [...partner.contacts].sort(
    (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0),
  );
  for (const c of contacts) {
    if (channel === 'email') {
      if (!c.emailConsent) continue;
      const address = pickEmail(c.emails);
      if (!address) continue;
      return {
        allowed: true,
        contactId: c.id,
        contactName: c.name,
        address,
        channel: 'email',
      };
    } else {
      if (!c.smsConsent) continue;
      const address = pickPhone(c.phones);
      if (!address) continue;
      return {
        allowed: true,
        contactId: c.id,
        contactName: c.name,
        address,
        channel: 'sms',
      };
    }
  }

  // We had contacts, but none with consent + an address for this channel.
  const anyAddress = contacts.some((c) =>
    channel === 'email' ? pickEmail(c.emails) : pickPhone(c.phones),
  );
  return {
    allowed: false,
    reason: anyAddress ? 'no_consent_contact' : 'no_address',
  };
}

/**
 * Returns true if the CURRENT hour in `tz` is inside [QUIET_HOURS_START,
 * QUIET_HOURS_END). Quiet-hours env vars override the defaults so admins
 * can tighten the window without a schema change.
 */
export function inQuietHoursWindow(now: Date, tz: string): boolean {
  const start = parseHourEnv(process.env.QUIET_HOURS_START, DEFAULT_QUIET_START);
  const end = parseHourEnv(process.env.QUIET_HOURS_END, DEFAULT_QUIET_END);

  // Get hour in the given timezone. Intl is the simplest way that
  // doesn't pull in a date lib.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'America/Denver',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour');
  const hour = hourPart ? parseInt(hourPart.value, 10) : 12;

  if (start <= end) {
    return hour >= start && hour < end;
  }
  // Window wraps midnight (e.g. start=20, end=8 means 20:00–08:00).
  return hour >= start || hour < end;
}

function parseHourEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 23) return fallback;
  return n;
}

function pickEmail(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  // Prefer primary, prefer non-unsubscribed.
  const entries = raw
    .map((e) => {
      if (typeof e !== 'object' || e === null) return null;
      const o = e as { address?: string; primary?: boolean; unsubscribedAt?: string | null };
      if (!o.address || typeof o.address !== 'string') return null;
      return { address: o.address, primary: !!o.primary, unsubscribed: Boolean(o.unsubscribedAt) };
    })
    .filter((e): e is { address: string; primary: boolean; unsubscribed: boolean } => e !== null)
    .filter((e) => !e.unsubscribed);
  if (entries.length === 0) return null;
  entries.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  return entries[0]!.address;
}

function pickPhone(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const entries = raw
    .map((p) => {
      if (typeof p !== 'object' || p === null) return null;
      const o = p as { number?: string; primary?: boolean };
      if (!o.number || typeof o.number !== 'string') return null;
      return { number: o.number, primary: !!o.primary };
    })
    .filter((p): p is { number: string; primary: boolean } => p !== null);
  if (entries.length === 0) return null;
  entries.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  return entries[0]!.number;
}
