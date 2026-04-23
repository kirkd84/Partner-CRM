import type { NextConfig } from 'next';

// Railway container target (A001 amendment) — standalone output keeps
// the final Docker image small.
const nextConfig: NextConfig = {
  output: 'standalone',
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
    // ESLint is run by the monorepo root `pnpm lint`
    ignoreDuringBuilds: true,
  },
  // Prisma + bcrypt need to stay external (not bundled) for the server.
  // Renamed in Next 15: was `experimental.serverComponentsExternalPackages`.
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
