import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@partnerradar/db';
import { LoginInput } from '@partnerradar/types';

// SSO placeholder — Phase 5 will add a Storm Cloud OAuth provider here once
// API docs land. The `stormCloudUserId` field on User is already wired so
// linking is a simple lookup.

declare module 'next-auth' {
  interface User {
    role?: 'REP' | 'MANAGER' | 'ADMIN';
    avatarColor?: string;
    markets?: string[];
  }
  interface Session {
    user: {
      id: string;
      role: 'REP' | 'MANAGER' | 'ADMIN';
      avatarColor: string;
      markets: string[];
    } & DefaultSession['user'];
  }
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 /* 8h sliding refresh */ },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: '/login' },
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
  callbacks: {
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
        session.user.id = token.sub!;
        session.user.role = (token.role as 'REP' | 'MANAGER' | 'ADMIN') ?? 'REP';
        session.user.avatarColor = (token.avatarColor as string) ?? '#2563eb';
        session.user.markets = (token.markets as string[]) ?? [];
      }
      return session;
    },
  },
});
