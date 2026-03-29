FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/electron-main.ts ./
COPY --from=builder /app/src/db.ts ./src/
COPY --from=builder /app/src/types.ts ./src/
COPY --from=builder /app/src/preload.ts ./src/
COPY --from=builder /app/mcp_bridge.db ./
COPY --from=builder /app/.env ./.env

USER nodejs
EXPOSE 3000

CMD ["pnpm", "dev"]