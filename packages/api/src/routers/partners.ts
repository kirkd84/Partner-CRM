import { TRPCError } from '@trpc/server';
import { prisma } from '@partnerradar/db';
import { PartnerCreateInput, PartnerFiltersInput, STAGE_LABELS } from '@partnerradar/types';
import { authedProcedure, managerProcedure, router } from '../trpc';
import { can } from '../permissions';

export const partnersRouter = router({
  list: authedProcedure.input(PartnerFiltersInput).query(async ({ ctx, input }) => {
    const userMarkets = ctx.user.markets;
    const where: Parameters<typeof prisma.partner.findMany>[0] extends infer T
      ? T extends { where?: infer W }
        ? W
        : never
      : never = {
      marketId: { in: userMarkets },
      archivedAt: input.archivedOnly ? { not: null } : null,
      ...(ctx.user.role === 'REP'
        ? {
            OR: [
              { assignedRepId: ctx.user.id },
              { assignedRepId: null },
            ],
          }
        : {}),
      ...(input.stage?.length ? { stage: { in: input.stage } } : {}),
      ...(input.partnerType?.length ? { partnerType: { in: input.partnerType } } : {}),
      ...(input.assignedRepId !== undefined
        ? { assignedRepId: input.assignedRepId }
        : {}),
      ...(input.marketId ? { marketId: input.marketId } : {}),
      ...(input.search
        ? {
            OR: [
              { companyName: { contains: input.search, mode: 'insensitive' } },
              { publicId: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const items = await prisma.partner.findMany({
      where,
      orderBy: [{ stageChangedAt: 'desc' }, { createdAt: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: {
        assignedRep: { select: { id: true, name: true, avatarColor: true } },
        _count: { select: { contacts: true, activities: true } },
      },
    });
    let nextCursor: string | undefined;
    if (items.length > input.limit) {
      const next = items.pop();
      nextCursor = next?.id;
    }
    return { items, nextCursor };
  }),

  byId: authedProcedure.input((raw: unknown) => raw as { id: string }).query(
    async ({ ctx, input }) => {
      const partner = await prisma.partner.findUnique({
        where: { id: input.id },
        include: {
          contacts: true,
          activities: { orderBy: { createdAt: 'desc' }, take: 50, include: { user: true } },
          tasks: { where: { completedAt: null } },
          appointments: true,
          expenses: true,
          files: true,
          revenueAttributions: true,
          tags: true,
          assignedRep: true,
          market: true,
        },
      });
      if (!partner) throw new TRPCError({ code: 'NOT_FOUND' });
      const allowed = can(ctx.user, 'partners.view', {
        kind: 'partner',
        marketId: partner.marketId,
        assignedRepId: partner.assignedRepId,
        archivedAt: partner.archivedAt,
      });
      if (!allowed) throw new TRPCError({ code: 'FORBIDDEN' });
      return partner;
    },
  ),

  create: authedProcedure.input(PartnerCreateInput).mutation(async ({ ctx, input }) => {
    if (!ctx.user.markets.includes(input.marketId)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Market not in your scope' });
    }
    // Generate next PR-#### public id (simple counter based on seed offset 1000)
    const count = await prisma.partner.count();
    const publicId = `PR-${1001 + count}`;
    return prisma.partner.create({
      data: {
        ...input,
        publicId,
        assignedRepId: input.assignedRepId ?? ctx.user.id,
      },
    });
  }),

  stats30d: authedProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [byStage, activated] = await Promise.all([
      prisma.partner.groupBy({
        by: ['stage'],
        where: {
          marketId: { in: ctx.user.markets },
          archivedAt: null,
          ...(ctx.user.role === 'REP'
            ? { OR: [{ assignedRepId: ctx.user.id }, { assignedRepId: null }] }
            : {}),
        },
        _count: { stage: true },
      }),
      prisma.partner.count({
        where: { activatedAt: { gte: since }, marketId: { in: ctx.user.markets } },
      }),
    ]);
    const counts = Object.fromEntries(byStage.map((b) => [b.stage, b._count.stage]));
    return {
      byStage: counts,
      activatedLast30Days: activated,
      labels: STAGE_LABELS,
    };
  }),

  // Phase 2 will flesh these out. Scaffolded so the web UI type-checks.
  activate: managerProcedure
    .input((raw: unknown) => raw as { id: string })
    .mutation(async ({ ctx, input }) => {
      throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Activation lands in Phase 2' });
      // Phase 2: call Storm adapter, set stage=ACTIVATED, log Activity+AuditLog,
      // return activation payload (client fires balloons on success)
      // eslint-disable-next-line @typescript-eslint/no-unreachable-code
      return { id: input.id, actor: ctx.user.id };
    }),
});
