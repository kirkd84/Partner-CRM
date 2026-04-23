/**
 * tRPC v11 bootstrap. Context derives the authenticated user from the
 * NextAuth session; procedures branch on role via the permissions matrix.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { AuthorizedUser } from './permissions';

export interface Context {
  user: AuthorizedUser | null;
  ipAddress?: string;
  userAgent?: string;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError: error.cause instanceof Error && error.cause.name === 'ZodError' ? error.cause : null,
    },
  }),
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const managerProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'MANAGER' && ctx.user.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});

export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});
