import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { Prisma, prisma } from '@partnerradar/db';
import {
  PartnerCreateInput,
  PartnerFiltersInput,
  type PartnerStage,
  STAGE_LABELS,
} from '@partnerradar/types';
import { authedProcedure, managerProcedure, router } from '../trpc';
import { can } from '../permissions';

export const partnersRouter = router({
  list: authedProcedure.input(PartnerFiltersInput).query(async ({ ctx, input }) => {
    const where: Prisma.PartnerWhereInput = {
      marketId: { in: ctx.user.markets },
      archivedAt: input.archivedOnly ? { not: null } : null,
    };
    if (ctx.user.role === 'REP') {
      where.OR = [{ assignedRepId: ctx.user.id }, { assignedRepId: null }];
    }
    if (input.stage?.length) where.stage = { in: input.stage };
    if (input.partnerType?.length) where.partnerType = { in: input.partnerType };
    if (input.assignedRepId !== undefined) where.assignedRepId = input.assignedRepId;
    if (input.marketId) where.marketId = input.marketId;
    if (input.search) {
      where.OR = [
        ...(where.OR ?? []),
        { companyName: { contains: input.search, mode: 'insensitive' } },
        { publicId: { contains: input.search, mode: 'insensitive' } },
      ];
    }

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

  byId: authedProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const partner = await prisma.partner.findUnique({
      where: { id: input.id },
      include: {
        contacts: true,
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { user: true },
        },
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
  }),

  create: authedProcedure.input(PartnerCreateInput).mutation(async ({ ctx, input }) => {
    if (!ctx.user.markets.includes(input.marketId)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Market not in your scope' });
    }
    const count = await prisma.partner.count();
    const publicId = `PR-${1001 + count}`;
    return prisma.partner.create({
      data: {
        publicId,
        companyName: input.companyName,
        partnerType: input.partnerType,
        customType: input.customType,
        marketId: input.marketId,
        address: input.address,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        zip: input.zip,
        website: input.website ?? null,
        notes: input.notes,
        assignedRepId: input.assignedRepId ?? ctx.user.id,
      },
    });
  }),

  stats30d: authedProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const baseWhere: Prisma.PartnerWhereInput = {
      marketId: { in: ctx.user.markets },
      archivedAt: null,
    };
    if (ctx.user.role === 'REP') {
      baseWhere.OR = [{ assignedRepId: ctx.user.id }, { assignedRepId: null }];
    }
    const [byStage, activated] = await Promise.all([
      prisma.partner.groupBy({
        by: ['stage'],
        where: baseWhere,
        _count: { stage: true },
      }),
      prisma.partner.count({
        where: { activatedAt: { gte: since }, marketId: { in: ctx.user.markets } },
      }),
    ]);
    const counts: Partial<Record<PartnerStage, number>> = {};
    for (const row of byStage) counts[row.stage] = row._count.stage;
    return {
      byStage: counts,
      activatedLast30Days: activated,
      labels: STAGE_LABELS,
    };
  }),

  // Phase 2 fills this in end-to-end (Storm push + balloons).
  activate: managerProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ input }) => {
      throw new TRPCError({
        code: 'METHOD_NOT_SUPPORTED',
        message: `Activation lands in Phase 2 (partnerId=${input.id})`,
      });
    }),
});
