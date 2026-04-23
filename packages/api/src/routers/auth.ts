import { authedProcedure, router } from '../trpc';

export const authRouter = router({
  me: authedProcedure.query(({ ctx }) => ctx.user),
});
