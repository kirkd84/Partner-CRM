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
  experimental: {
    // Prisma + Next 15 standalone compatibility
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
};

export default nextConfig;
