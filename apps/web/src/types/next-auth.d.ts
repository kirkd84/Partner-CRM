/**
 * NextAuth module augmentation — loaded unconditionally by TS regardless
 * of import order, so both `auth.ts` and `auth.config.ts` can rely on
 * `session.user.id/role/avatarColor/markets` existing.
 */
import 'next-auth';
import 'next-auth/jwt';

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
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'REP' | 'MANAGER' | 'ADMIN';
    avatarColor?: string;
    markets?: string[];
  }
}
