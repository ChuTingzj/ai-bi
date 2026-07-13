FROM node:20-alpine AS base
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @ai-bi/db generate
RUN pnpm --filter @ai-bi/api build

FROM base AS runner
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder /repo ./
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
