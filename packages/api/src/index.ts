import { router } from './trpc';
import { authRouter } from './routers/auth';
import { partnersRouter } from './routers/partners';
import { activitiesRouter } from './routers/activities';

export const appRouter = router({
  auth: authRouter,
  partners: partnersRouter,
  activities: activitiesRouter,
});

export type AppRouter = typeof appRouter;

export * from './trpc';
export * from './permissions';
