# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Islamabad Fix — production image
#
# Three stages so the runtime image carries no build tooling, no source and no
# dev dependencies: deps installs, build compiles, runner runs. The final image
# is Next's standalone server plus the Prisma engine and migration files, run as
# an unprivileged user.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS base
# Prisma's engines need this on Alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ------------------------------------------------------------------ deps ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
# `npm ci` runs prisma generate through the postinstall hook, so the client is
# built against the same schema the app was written for.
RUN npm ci

# ----------------------------------------------------------------- build ----
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time, so the public URL has to be
# known here. Override with --build-arg for a non-local deployment.
ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
# A build-time placeholder: the schema is read for `prisma generate`, never
# connected to. The real DATABASE_URL arrives at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime-32ch"
RUN npm run build

# ---------------------------------------------------------------- runner ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# The standalone server, its traced node_modules and the static assets.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Migrations and the Prisma CLI, so the container can run `migrate deploy` as a
# release step without a second image.
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Only used by STORAGE_DRIVER=local. A real deployment mounts a volume here or
# uses S3/MinIO instead — container filesystems do not survive a restart.
RUN mkdir -p /app/storage && chown nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>r.json()).then(j=>process.exit(j.status==='ok'?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
