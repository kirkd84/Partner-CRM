/**
 * Newsletter click-tracking redirect.
 *
 * Embedded by render.ts → renderNewsletterHtml as the href= for every
 * http(s) link. Stamps firstClickedAt on the NewsletterRecipient row
 * (idempotent — only the first click counts), bumps
 * Newsletter.clickCount, and 302s to the original URL passed via the
 * `u` query param. If `u` is missing, malformed, or not http(s), we
 * 302 to the app home rather than throwing — the recipient should not
 * see an error page.
 *
 * Why the route lives at the top level (/api/click) and not under
 * /api/newsletters/click: shorter URL = shorter rendered email = less
 * spam-filter weight per link.
 */

import { prisma } from '@partnerradar/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const HOME = '/';

function safeRedirectUrl(raw: string | null): string {
  if (!raw) return HOME;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return HOME;
  }
  try {
    const u = new URL(decoded);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return HOME;
    return u.toString();
  } catch {
    return HOME;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const target = safeRedirectUrl(url.searchParams.get('u'));
  // Fire-and-forget — never let a slow DB hold the redirect. The
  // recipient just wants their content; we'd rather miss a click count
  // than leave them staring at a spinner.
  prisma.newsletterRecipient
    .findUnique({
      where: { id },
      select: { id: true, firstClickedAt: true, newsletterId: true },
    })
    .then(async (rec) => {
      if (!rec) return;
      const now = new Date();
      const updates: Promise<unknown>[] = [];
      if (!rec.firstClickedAt) {
        updates.push(
          prisma.newsletterRecipient.update({
            where: { id: rec.id },
            data: { firstClickedAt: now, openedAt: now },
          }),
          prisma.newsletter.update({
            where: { id: rec.newsletterId },
            data: { clickCount: { increment: 1 } },
          }),
        );
      }
      await Promise.allSettled(updates);
    })
    .catch((err) => console.warn('[click] track failed', err));

  return NextResponse.redirect(target, { status: 302 });
}
