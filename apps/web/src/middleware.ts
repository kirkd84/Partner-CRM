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
    // Run on everything except:
    //   • Static assets (_next/static, _next/image, favicon, any file
    //     extension like .png/.js/.css).
    //   • /api/webhooks/*   — HMAC-signed, own auth (Storm, etc.)
    //   • /api/inngest      — Inngest signs PUT/POST with its own
    //                         signing key; the serve() adapter
    //                         verifies. Middleware must NOT redirect
    //                         these to /login, which was breaking the
    //                         "Sync app" handshake in the Inngest
    //                         dashboard (responses came back as the
    //                         prerendered login HTML).
    //   • /api/auth/google/* — Google OAuth callback carries state we
    //                         verify ourselves; the authorize route
    //                         reads the session directly. Keeping
    //                         middleware off the path avoids double
    //                         redirects during the Google hop.
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/inngest|api/auth/google|api/unsubscribe|api/events/.*/ics|api/events/.*/qr|unsubscribe|rsvp|claim|arrival|share|.*\\..*).*)',
  ],
};
