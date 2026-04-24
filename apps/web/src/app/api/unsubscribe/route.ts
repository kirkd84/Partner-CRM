/**
 * RFC 8058 one-click unsubscribe endpoint.
 *
 * Gmail, Apple Mail and Outlook will POST here when the user hits the
 * native "Unsubscribe" button, with Content-Type
 * `application/x-www-form-urlencoded` and body `List-Unsubscribe=One-Click`.
 *
 * The token comes from the query string (same shape as the public
 * /unsubscribe page) so we don't need a JSON body parser. Success is
 * always 2xx — major providers reject a 4xx response and stop showing
 * the unsubscribe affordance, which hurts deliverability.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@partnerradar/db';
import { verifyUnsubscribeToken } from '@/lib/messaging/unsubscribe-token';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  if (!token) return new NextResponse('ok', { status: 200 });

  const v = verifyUnsubscribeToken(token);
  if (!v.ok) return new NextResponse('ok', { status: 200 });

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: v.contactId },
      select: { id: true, emails: true },
    });
    if (!contact) return new NextResponse('ok', { status: 200 });
    const emails = Array.isArray(contact.emails) ? contact.emails : [];
    const lower = v.address.toLowerCase();
    let changed = false;
    const updated = emails.map((e: unknown) => {
      if (typeof e !== 'object' || e === null) return e;
      const obj = e as { address?: string; unsubscribedAt?: string | null };
      if (typeof obj.address === 'string' && obj.address.toLowerCase() === lower) {
        if (!obj.unsubscribedAt) {
          changed = true;
          return { ...obj, unsubscribedAt: new Date().toISOString() };
        }
      }
      return e;
    });

    if (changed) {
      const stillSubbed = updated.some((e: unknown) => {
        if (typeof e !== 'object' || e === null) return false;
        const obj = e as { address?: string; unsubscribedAt?: string | null };
        return Boolean(obj.address && !obj.unsubscribedAt);
      });
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          emails: updated as unknown as never,
          emailConsent: stillSubbed,
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: null,
          entityType: 'contact',
          entityId: contact.id,
          action: 'email_unsubscribe',
          diff: { address: v.address, via: 'list_unsubscribe_post' } as never,
        },
      });
    }
  } catch (err) {
    // Log but still return 200 — never penalise deliverability for our DB hiccup.
    console.warn('[unsubscribe api] failed', err);
  }

  return new NextResponse('ok', { status: 200 });
}

// Providers sometimes probe with GET before POST. Redirect to the
// user-facing page so a manual click from a browser also works.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const base = new URL(req.url);
  const redirect = new URL('/unsubscribe', base);
  if (token) redirect.searchParams.set('token', token);
  return NextResponse.redirect(redirect);
}
