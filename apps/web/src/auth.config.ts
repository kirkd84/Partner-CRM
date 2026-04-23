import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe auth config. Imported by `middleware.ts` (Edge runtime)
 * and `auth.ts` (Node runtime). Keeps this file free of Node-only
 * deps like `bcryptjs` and `@partnerradar/db` — otherwise the middleware
 * bundle tries to load them in Edge and errors.
 *
 * The full auth config (with Credentials provider + bcrypt) lives in
 * `auth.ts` and spreads this config in.
 */
export const authConfig = {
  // Required for NextAuth v5 when running behind a proxy (Railway,
  // Vercel, Fly, etc.) — otherwise auth refuses to operate and shows
  // the generic "Server error / configuration problem" page.
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 /* 8h sliding */ },
  pages: { signIn: '/login' },
  providers: [], // actually wired in `auth.ts`
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Allow: login page, NextAuth endpoints, healthcheck, static assets
      if (
        pathname.startsWith('/login') ||
        pathname.startsWith('/api/auth') ||
        pathname === '/api/health'
      ) {
        return true;
      }

      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.avatarColor = user.avatarColor;
        token.markets = user.markets ?? [];
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub ?? session.user.id) as string;
        session.user.role = (token.role as 'REP' | 'MANAGER' | 'ADMIN' | undefined) ?? 'REP';
        session.user.avatarColor = (token.avatarColor as string | undefined) ?? '#2563eb';
        session.user.markets = (token.markets as string[] | undefined) ?? [];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
