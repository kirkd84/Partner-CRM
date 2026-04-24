'use server';

/**
 * Public RSVP actions — no auth required; the rsvpToken in the URL is
 * the authentication. Anyone with the link can respond on behalf of
 * the invitee (this matches how email invite links work everywhere).
 *
 * On state change we also trigger the cascade engine:
 *   • Decline → tickets RELEASED → next in queue promoted
 *   • Partial drop → specific tickets RELEASED → per-type cascade
 *   • Confirm → no cascade, just status flip
 *
 * Cascade promotion is currently a thin stub that sends an Inngest
 * event; the Inngest handler lives in lib/jobs/event-cascade.ts.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';

export type RsvpAction = 'accept' | 'decline' | 'confirm' | 'cancel';

export interface RsvpInput {
  token: string;
  action: RsvpAction;
  plusOneName?: string;
  /** For partial accept/drop: ticketTypeIds the invitee wants to KEEP. */
  keepTicketTypeIds?: string[];
  cancelReason?: string;
}

export async function submitRsvp(input: RsvpInput): Promise<{
  ok: boolean;
  status?: string;
  error?: string;
}> {
  const invite = await prisma.evInvite.findUnique({
    where: { rsvpToken: input.token },
    include: {
      event: { select: { id: true, name: true, status: true, canceledAt: true } },
      ticketAssignments: true,
    },
  });
  if (!invite) return { ok: false, error: 'Invite not found' };
  if (invite.event.canceledAt || invite.event.status === 'CANCELED') {
    return { ok: false, error: 'This event was canceled' };
  }

  const now = new Date();

  switch (input.action) {
    case 'accept': {
      if (invite.status !== 'SENT' && invite.status !== 'QUEUED') {
        return { ok: false, error: `Can't accept — current status is ${invite.status}` };
      }
      const keep = new Set(
        input.keepTicketTypeIds ?? invite.ticketAssignments.map((a) => a.ticketTypeId),
      );
      const drop = invite.ticketAssignments.filter((a) => !keep.has(a.ticketTypeId));

      await prisma.$transaction([
        prisma.evInvite.update({
          where: { id: invite.id },
          data: {
            status: 'ACCEPTED',
            respondedAt: now,
            plusOneName: input.plusOneName?.trim() || null,
          },
        }),
        // Keep tentative → leave alone; only drop the ones the invitee declined.
        ...drop.map((a) =>
          prisma.evTicketAssignment.update({
            where: { id: a.id },
            data: { status: 'RELEASED' },
          }),
        ),
        prisma.evRsvpEvent.create({
          data: {
            inviteId: invite.id,
            kind: drop.length > 0 ? 'accepted-partial' : 'accepted',
            ticketDelta: {
              kept: [...keep],
              dropped: drop.map((a) => a.ticketTypeId),
            } as Prisma.InputJsonValue,
            actorType: 'invitee',
          },
        }),
      ]);

      if (drop.length > 0) {
        await triggerCascade(
          invite.event.id,
          drop.map((a) => a.ticketTypeId),
        );
      }
      revalidatePath(`/rsvp/${input.token}`);
      return { ok: true, status: 'ACCEPTED' };
    }

    case 'decline': {
      if (invite.status === 'DECLINED') return { ok: true, status: 'DECLINED' };
      const releasedTypes = invite.ticketAssignments.map((a) => a.ticketTypeId);
      await prisma.$transaction([
        prisma.evInvite.update({
          where: { id: invite.id },
          data: {
            status: 'DECLINED',
            respondedAt: now,
          },
        }),
        prisma.evTicketAssignment.updateMany({
          where: { inviteId: invite.id },
          data: { status: 'RELEASED' },
        }),
        prisma.evRsvpEvent.create({
          data: {
            inviteId: invite.id,
            kind: 'declined',
            actorType: 'invitee',
          },
        }),
      ]);
      await triggerCascade(invite.event.id, releasedTypes);
      revalidatePath(`/rsvp/${input.token}`);
      return { ok: true, status: 'DECLINED' };
    }

    case 'confirm': {
      if (invite.status !== 'ACCEPTED' && invite.status !== 'CONFIRMATION_REQUESTED') {
        return { ok: false, error: `Can't confirm from status ${invite.status}` };
      }
      await prisma.$transaction([
        prisma.evInvite.update({
          where: { id: invite.id },
          data: { status: 'CONFIRMED', confirmedAt: now },
        }),
        prisma.evTicketAssignment.updateMany({
          where: { inviteId: invite.id, status: 'TENTATIVE' },
          data: { status: 'CONFIRMED' },
        }),
        prisma.evRsvpEvent.create({
          data: {
            inviteId: invite.id,
            kind: 'confirmed',
            actorType: 'invitee',
          },
        }),
      ]);
      revalidatePath(`/rsvp/${input.token}`);
      return { ok: true, status: 'CONFIRMED' };
    }

    case 'cancel': {
      if (
        invite.status === 'CANCELED' ||
        invite.status === 'DECLINED' ||
        invite.status === 'AUTO_CANCELED'
      ) {
        return { ok: true, status: invite.status };
      }
      const releasedTypes = invite.ticketAssignments.map((a) => a.ticketTypeId);
      await prisma.$transaction([
        prisma.evInvite.update({
          where: { id: invite.id },
          data: {
            status: 'CANCELED',
            canceledAt: now,
            canceledReason: input.cancelReason?.trim() || null,
          },
        }),
        prisma.evTicketAssignment.updateMany({
          where: { inviteId: invite.id },
          data: { status: 'RELEASED' },
        }),
        prisma.evRsvpEvent.create({
          data: {
            inviteId: invite.id,
            kind: 'canceled',
            ticketDelta: input.cancelReason
              ? ({ reason: input.cancelReason } as Prisma.InputJsonValue)
              : undefined,
            actorType: 'invitee',
          },
        }),
      ]);
      await triggerCascade(invite.event.id, releasedTypes);
      revalidatePath(`/rsvp/${input.token}`);
      return { ok: true, status: 'CANCELED' };
    }
  }
}

async function triggerCascade(eventId: string, freedTicketTypeIds: string[]): Promise<void> {
  if (freedTicketTypeIds.length === 0) return;
  try {
    const { inngest } = await import('@/lib/inngest-client');
    await inngest.send({
      name: 'partner-portal/event.ticket-released',
      data: { eventId, ticketTypeIds: freedTicketTypeIds },
    });
  } catch (err) {
    console.warn('[rsvp] failed to enqueue cascade', err);
  }
}
