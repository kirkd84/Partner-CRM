import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Railway container target (A001 amendment) — standalone output keeps
// the final Docker image small. In a monorepo we must tell Next to
// trace from the workspace root AND explicitly include Prisma's
// engine binaries (they're dlopened at runtime, which Next's static
// tracer can't see).
const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  outputFileTracingIncludes: {
    '/**/*': [
      // Generated Prisma client + query engine (Linux musl)
      '../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**/*',
      '../../node_modules/.pnpm/@prisma+client*/node_modules/@prisma/client/**/*',
      // Schema + migrations in case anything reads them
      '../../packages/db/prisma/**/*',
    ],
  },
  reactStrictMode: true,
  transpilePackages: [
    '@partnerradar/api',
    '@partnerradar/config',
    '@partnerradar/db',
    '@partnerradar/types',
    '@partnerradar/ui',
    '@partnerradar/integrations',
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Prisma + bcrypt stay external (not bundled) for the server.
  // Renamed in Next 15: was `experimental.serverComponentsExternalPackages`.
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
