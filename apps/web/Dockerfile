FROM node:20-alpine AS base
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @ai-bi/web build

FROM base AS runner
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder /repo ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@ai-bi/web", "start"]
