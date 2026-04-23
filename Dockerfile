# ────────────────────────────────────────────────
# PartnerRadar web — Railway production image
# Multi-stage build: deps → build → runtime
# Next standalone output handles node_modules tracing; we just copy the
# finished bundle + the Prisma engine into runtime.
# ────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl openssl-dev && \
    corepack enable && \
    corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ── deps: install with frozen lockfile ──
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json ./packages/ui/
COPY packages/types/package.json ./packages/types/
COPY packages/ai/package.json ./packages/ai/
COPY packages/config/package.json ./packages/config/
COPY packages/integrations/package.json ./packages/integrations/
RUN pnpm install --frozen-lockfile

# ── build: generate Prisma client + build web ──
FROM base AS build
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter @partnerradar/db prisma:generate
RUN pnpm --filter web build

# ── runtime: minimal image with standalone output ──
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Non-root user
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# Next.js standalone output already traces node_modules (we configured
# outputFileTracingIncludes in next.config.ts to catch the Prisma engine
# binary which the static tracer can't see via its dynamic require).
# In a monorepo the standalone tree preserves the apps/web path.
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
# Server entrypoint lives at apps/web/server.js inside the standalone tree.
CMD ["node", "apps/web/server.js"]
