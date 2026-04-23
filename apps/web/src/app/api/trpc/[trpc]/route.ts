import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@partnerradar/api';
import { auth } from '@/auth';

const handler = async (req: Request) => {
  const session = await auth();
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({
      user: session?.user
        ? {
            id: session.user.id,
            role: session.user.role,
            markets: session.user.markets,
          }
        : null,
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    }),
  });
};

export { handler as GET, handler as POST };
