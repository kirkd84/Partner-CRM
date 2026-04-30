/**
 * Newsletter open-tracking pixel.
 *
 * Returns a 1×1 transparent GIF. As a side effect, stamps openedAt on
 * the NewsletterRecipient row (if it isn't already) and bumps the
 * Newsletter.openCount aggregate. The id parameter is the
 * NewsletterRecipient id, embedded in the rendered email body by
 * render.ts → renderNewsletterHtml.
 *
 * The route name is /api/pixel/[id]; render.ts appends `.gif` so mail
 * clients treat it as an image. Most mail clients will load images
 * (modulo Apple Mail's privacy proxy, which makes opens look-alike)
 * which is why we treat the open count as a soft signal — the click
 * tracker is the definitive engagement metric.
 */

import { prisma } from '@partnerradar/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Sub-100B GIF: 1x1 transparent. Generated with
//   `printf '\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b' | base64`
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Strip the .gif extension some mail clients tack on. Our render
  // hardcodes .gif at the end so we always have it; defensive code in
  // case a forwarder adjusts the URL.
  const recipientId = id.replace(/\.gif$/, '');
  // Fire-and-forget the open record so a slow DB never starves the
  // image response. Use Promise.allSettled-ish so a failure doesn't
  // bubble.
  prisma.newsletterRecipient
    .findUnique({
      where: { id: recipientId },
      select: { id: true, openedAt: true, newsletterId: true },
    })
    .then(async (rec) => {
      if (!rec || rec.openedAt) return;
      const now = new Date();
      await prisma.$transaction([
        prisma.newsletterRecipient.update({
          where: { id: rec.id },
          data: { openedAt: now },
        }),
        prisma.newsletter.update({
          where: { id: rec.newsletterId },
          data: { openCount: { increment: 1 } },
        }),
      ]);
    })
    .catch((err) => console.warn('[pixel] open track failed', err));

  return new NextResponse(new Uint8Array(TRANSPARENT_GIF), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.byteLength),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}
