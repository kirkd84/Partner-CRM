/**
 * GET /api/events/[id]/qr/[assignmentId]?token=SIGNED
 *
 * Returns a PNG image of the ticket QR. Auth is either:
 *   • a valid signed token in ?token=... (what email clients use to
 *     render inline QRs without a session)
 *   • a logged-in organizer/host on the event (for the dashboard view)
 *
 * The route is excluded from Edge middleware so public image loads
 * from email clients don't bounce off NextAuth.
 */

import { NextRequest } from 'next/server';
import { prisma } from '@partnerradar/db';
import { renderTicketQrPng, signTicketToken, verifyTicketToken } from '@/lib/events/qr';
import { auth } from '@/auth';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const { id: eventId, assignmentId } = await ctx.params;
  const token = req.nextUrl.searchParams.get('token');

  let authorized = false;
  let assignmentRow: { id: string; inviteId: string; ticketTypeId: string; status: string } | null =
    null;

  if (token) {
    const parsed = verifyTicketToken(eventId, token);
    if (parsed.ok && parsed.assignmentId === assignmentId) {
      assignmentRow = await prisma.evTicketAssignment.findUnique({
        where: { id: assignmentId },
        select: { id: true, inviteId: true, ticketTypeId: true, status: true },
      });
      authorized = !!assignmentRow;
    }
  }

  if (!authorized) {
    const session = await auth();
    if (session?.user) {
      // Verify the user can see this event (ADMIN, or market-scoped, or host).
      const event = await prisma.evEvent.findUnique({
        where: { id: eventId },
        include: { hosts: { select: { userId: true } } },
      });
      if (event) {
        const markets = session.user.markets ?? [];
        const role = session.user.role;
        const canSee =
          role === 'ADMIN' ||
          (markets.includes(event.marketId) &&
            (role === 'MANAGER' ||
              event.createdBy === session.user.id ||
              event.hosts.some((h) => h.userId === session.user.id)));
        if (canSee) {
          assignmentRow = await prisma.evTicketAssignment.findUnique({
            where: { id: assignmentId },
            select: { id: true, inviteId: true, ticketTypeId: true, status: true },
          });
          authorized = !!assignmentRow;
        }
      }
    }
  }

  if (!authorized || !assignmentRow) {
    return new Response('Not found', { status: 404 });
  }

  // (Re-)sign a fresh token so the embedded PNG reflects the current
  // assignment row — if it was just moved between invites via a hand-
  // assign or batch-offer claim, a stale external token would no longer
  // resolve correctly.
  const signed = signTicketToken({
    eventId,
    assignmentId: assignmentRow.id,
    inviteId: assignmentRow.inviteId,
    ticketTypeId: assignmentRow.ticketTypeId,
  });

  const png = await renderTicketQrPng(signed);
  return new Response(png as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
