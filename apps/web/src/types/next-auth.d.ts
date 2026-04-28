/**
 * NextAuth module augmentation — loaded unconditionally by TS regardless
 * of import order, so both `auth.ts` and `auth.config.ts` can rely on
 * `session.user.id/role/avatarColor/markets/tenantId` existing.
 */
import 'next-auth';
import 'next-auth/jwt';

type Role = 'REP' | 'MANAGER' | 'ADMIN' | 'SUPER_ADMIN';

declare module 'next-auth' {
  interface User {
    role?: Role;
    avatarColor?: string;
    markets?: string[];
    tenantId?: string | null;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      avatarColor: string;
      markets: string[];
      /** Tenant the user belongs to. Null for SUPER_ADMIN. */
      tenantId: string | null;
      /**
       * The tenant the session is currently acting-as. Equal to
       * tenantId for regular users; SUPER_ADMINs can switch this via
       * /super-admin so they can debug a customer environment without
       * a separate login.
       */
      activeTenantId: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: Role;
    avatarColor?: string;
    markets?: string[];
    tenantId?: string | null;
    activeTenantId?: string | null;
  }
}
