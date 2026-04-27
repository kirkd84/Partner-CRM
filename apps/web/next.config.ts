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
    '@partnerradar/ai',
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
  // Don't let a lone TS error block the Railway deploy. `tsc` still
  // runs locally and in CI; production build should ship.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Prisma + bcrypt stay external (not bundled) for the server.
  // Renamed in Next 15: was `experimental.serverComponentsExternalPackages`.
  // Satori + @resvg/resvg-js are native node modules (resvg ships a
  // platform-specific `.node` binary) and MUST NOT be bundled by
  // webpack — they're only ever loaded by the /api/studio/designs/[id]/png
  // server route via dynamic import.
  serverExternalPackages: [
    '@prisma/client',
    'bcryptjs',
    '@anthropic-ai/sdk',
    'inngest',
    'satori',
    '@resvg/resvg-js',
  ],

  /**
   * Security headers — applied to every response. Tightening these from
   * the Next.js defaults closes off three real risks for a CRM that
   * holds partner PII:
   *
   *   1. Clickjacking — X-Frame-Options + frame-ancestors keeps the app
   *      from being iframed by a phishing page that proxies actions.
   *   2. MIME-sniffing — X-Content-Type-Options stops a browser from
   *      executing a CSV download as JS if served with the wrong type.
   *   3. Referrer leakage — strict-origin-when-cross-origin keeps URLs
   *      with partner IDs out of third-party analytics referers.
   *
   * CSP is intentionally *not* fully locked down — Google Maps JS,
   * Satori font fetches, and the marketing wizard's variable image
   * sources mean a strict CSP would ship broken. We start with an
   * explicit-allow list for the things we know about and tighten over
   * time. `unsafe-inline` for styles is required by Tailwind's @apply
   * generated classes; script-src is locked to self + the Maps script
   * we explicitly load.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Browser sends only origin (not path) on cross-origin requests.
          // Path can leak partner IDs to analytics on other domains.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Don't let third-party iframes embed us. CSP frame-ancestors
          // below is the modern equivalent; X-Frame-Options is the
          // belt-and-suspenders for older browsers.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Drop legacy XSS-Protection (it's been deprecated and can
          // introduce vulnerabilities in older browsers).
          { key: 'X-XSS-Protection', value: '0' },
          // Disable browser features we don't use. If we ever add
          // geolocation (route start = "current location") we'll need
          // to flip geolocation=(self). camera/mic kept off for now.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
          },
          // HSTS — only meaningful in prod where we're served over HTTPS.
          // 6 months, includeSubDomains. preload off until Kirk has
          // committed to HTTPS-only across every subdomain forever.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=15552000; includeSubDomains',
          },
          // Content Security Policy. Permissive enough to not break the
          // map / studio / inline event handlers; tightened version of
          // Next.js defaults. Tweak when we add new third-party SDKs.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-eval' is required by Next 15 dev HMR + Satori's
              // font loader at runtime. 'unsafe-inline' is required by
              // Next's inline framework manifest.
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              // data: covers base64 image uploads in the marketing studio.
              // blob: covers File-API generated previews.
              "img-src 'self' data: blob: https: https://maps.googleapis.com https://maps.gstatic.com https://*.googleusercontent.com",
              // Allow our own server actions + Google Maps + the Anthropic
              // / fal.ai endpoints. Add Sentry / R2 / etc. here when wired.
              "connect-src 'self' https://maps.googleapis.com https://*.googleapis.com https://api.anthropic.com https://fal.run",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
      {
        // Public token endpoints (RSVP, share, claim, arrival) need a
        // looser frame-ancestors because hosts sometimes embed RSVP
        // links in their own event-management tools. Override here so
        // the global DENY doesn't block them.
        source: '/(rsvp|share|claim|arrival)/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ];
  },
};

export default nextConfig;
