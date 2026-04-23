/**
 * Prisma client singleton. Import this everywhere instead of instantiating
 * PrismaClient directly — the singleton avoids exhausting the connection
 * pool in dev (Next.js hot reload creates many instances otherwise).
 */
import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type Db = typeof prisma;
export { Prisma };
export * from '@prisma/client';
