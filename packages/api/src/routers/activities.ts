import { prisma } from '@partnerradar/db';
import { authedProcedure, router } from '../trpc';

export const activitiesRouter = router({
  feed: authedProcedure.query(async ({ ctx }) => {
    return prisma.activity.findMany({
      where: {
        partner: {
          marketId: { in: ctx.user.markets },
          ...(ctx.user.role === 'REP'
            ? { OR: [{ assignedRepId: ctx.user.id }, { assignedRepId: null }] }
            : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        user: { select: { id: true, name: true, avatarColor: true } },
        partner: { select: { id: true, publicId: true, companyName: true } },
      },
    });
  }),
});
