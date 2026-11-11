# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# All dependencies (dev included): used to build and to run migrations.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
RUN npm run build

# One-shot migration runner: `docker compose run --rm migrate` (up) or `... migrate down`.
FROM deps AS migrate
COPY tsconfig.json ./
COPY src ./src
USER node
ENTRYPOINT ["node", "--import", "tsx", "src/db/migrate.ts"]
CMD ["up"]

# Production image: Next.js standalone output only, non-root.
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
