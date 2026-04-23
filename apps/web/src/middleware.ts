/**
 * Edge-runtime middleware. Deliberately imports ONLY the edge-safe
 * `authConfig` — never `./auth` which pulls bcryptjs/Prisma and would
 * fail to run in Edge.
 *
 * The `authorized` callback in auth.config.ts decides whether to allow
 * a request; NextAuth redirects unauthenticated users to `/login`
 * automatically when `authorized` returns false.
 */
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

export const config = {
  matcher: [
    // Run on everything except static assets, favicon, and Next internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
