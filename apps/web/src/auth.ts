import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@partnerradar/db';
import { LoginInput } from '@partnerradar/types';
import { authConfig } from './auth.config';

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
      async authorize(raw) {
        const parsed = LoginInput.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email },
          include: { markets: true },
        });
        if (!user || !user.passwordHash || !user.active) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
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
