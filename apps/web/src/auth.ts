import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@partnerradar/db';
import { LoginInput } from '@partnerradar/types';
import { authConfig } from './auth.config';
import { checkLimit, ipFromRequest, resetLimit } from './lib/security/rate-limit';

// Session / User / JWT augmentations live in src/types/next-auth.d.ts
// so both this file and auth.config.ts pick them up regardless of import
// order. SSO placeholder — Phase 5 will add a Storm Cloud OAuth provider
// here once API docs land.

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw, request) {
        const parsed = LoginInput.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Rate limit by IP and by IP+email together. The IP-only bucket
        // catches a single attacker rotating usernames; the IP+email
        // bucket catches a slow drip against one account.
        //
        // Failures are tracked separately from total attempts so a
        // legit user typing their password right doesn't burn through
        // the IP-wide limit.
        const ip = request ? ipFromRequest({ headers: request.headers }) : 'unknown-ip';
        const ipBucket = `login:ip:${ip}`;
        const userBucket = `login:user:${ip}:${email.toLowerCase()}`;
        const ipResult = checkLimit(ipBucket, 60_000, 20); // 20/min/IP
        const userResult = checkLimit(userBucket, 5 * 60_000, 5); // 5/5min/(IP,user)
        if (!ipResult.ok || !userResult.ok) {
          console.warn('[auth] rate-limit hit', {
            ip,
            email,
            ipExceeded: !ipResult.ok,
            userExceeded: !userResult.ok,
          });
          // NextAuth treats null as "wrong credentials". Throwing here
          // would surface a stack trace; null gives the same UX as a
          // bad password without leaking that the user is rate-limited.
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { markets: true },
        });
        if (!user || !user.passwordHash || !user.active) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        // Successful login — drop the bucket so the user isn't penalized
        // for prior failed attempts.
        resetLimit(userBucket);

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarColor: user.avatarColor,
          markets: user.markets.map((m) => m.marketId),
        };
      },
    }),
  ],
});
