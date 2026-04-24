/**
 * Public unsubscribe page — no auth, no middleware, no tracking.
 *
 * Flow:
 *   • GET /unsubscribe?token=...
 *       – Validate the HMAC. If good, mark the email as unsubscribed
 *         and show a "you're unsubscribed" confirmation. If bad,
 *         show a "we couldn't process this link" page.
 *
 * One-click (RFC 8058 List-Unsubscribe=One-Click) support comes
 * through a companion POST endpoint at /api/unsubscribe — Gmail &
 * Apple Mail will POST to it when the user hits "Unsubscribe" in the
 * native UI. See route.ts next to this file.
 *
 * We use marketing plumbing best-practice: SUCCESS response on
 * bad token too, so scanners can't harvest valid contact ids via
 * differential responses. Behind the scenes we still log and no-op.
 */

import { prisma } from '@partnerradar/db';
import { verifyUnsubscribeToken } from '@/lib/messaging/unsubscribe-token';

export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = await processUnsubscribe(token ?? '');

  // Always render the same shell. Status color differs for debuggable
  // 4xx's but the message is always polite.
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">You're unsubscribed</h1>
        <p className="mt-3 text-sm text-gray-700">
          {result.address ? (
            <>
              We've removed <strong>{result.address}</strong> from our follow-up list. You won't get
              any more automated emails from us to that address.
            </>
          ) : (
            <>We've processed your request. If we had you on our list, you're off it now.</>
          )}
        </p>
        <p className="mt-3 text-xs text-gray-500">
          If you'd rather stay in touch but only about specific things, reply directly to the email
          you received — a real person is on the other end.
        </p>
        <p className="mt-6 text-[11px] text-gray-400">
          No further action is required. You can close this tab.
        </p>
      </div>
    </div>
  );
}

async function processUnsubscribe(token: string): Promise<{ ok: boolean; address?: string }> {
  if (!token) return { ok: false };
  const v = verifyUnsubscribeToken(token);
  if (!v.ok) {
    console.info('[unsubscribe] rejected token', { reason: v.reason });
    return { ok: false };
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: v.contactId },
      select: { id: true, emails: true, partnerId: true, name: true },
    });
    if (!contact) {
      console.info('[unsubscribe] contact not found', v.contactId);
      return { ok: false };
    }

    // emails is JSON: [{ address, label, primary, unsubscribedAt }]
    const emails = Array.isArray(contact.emails) ? contact.emails : [];
    const lowerTarget = v.address.toLowerCase();
    let changed = false;
    const updated = emails.map((e: unknown) => {
      if (typeof e !== 'object' || e === null) return e;
      const obj = e as { address?: string; unsubscribedAt?: string | null };
      if (typeof obj.address === 'string' && obj.address.toLowerCase() === lowerTarget) {
        if (!obj.unsubscribedAt) {
          changed = true;
          return { ...obj, unsubscribedAt: new Date().toISOString() };
        }
      }
      return e;
    });

    if (changed) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          emails: updated as unknown as never,
          // Also flip the channel consent off if no address remains
          // subscribed, so future sends are blocked entirely.
          emailConsent: anyStillSubscribed(updated),
        },
      });
      // AuditLog.userId is nullable, so we can mark this as system-
      // initiated without inventing a fake user row. Activity.userId
      // isn't nullable, so we skip the rep feed — the consent flag
      // itself is the observable signal when a rep tries to send next.
      await prisma.auditLog.create({
        data: {
          userId: null,
          entityType: 'contact',
          entityId: contact.id,
          action: 'email_unsubscribe',
          diff: { address: v.address, via: 'public_link' } as never,
        },
      });
    }

    return { ok: true, address: v.address };
  } catch (err) {
    console.warn('[unsubscribe] processing failed', err);
    return { ok: false };
  }
}

function anyStillSubscribed(emails: unknown[]): boolean {
  return emails.some((e) => {
    if (typeof e !== 'object' || e === null) return false;
    const obj = e as { address?: string; unsubscribedAt?: string | null };
    return Boolean(obj.address && !obj.unsubscribedAt);
  });
}
