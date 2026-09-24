English | [中文](./README.zh-CN.md)

# DataMind AI-BI

Enterprise multi-agent data insight platform: a natural-language question → multi-agent SQL → a Docker sandbox → charts and insights.

## What it does

Ask a question in natural language. LangGraph.js agents (Planner, SQL, Review, Analyst, and Chart) collaborate to generate SQL. The query runs in a Docker sandbox. The product returns charts and business insights.

See [technical-design-v2.md](./technical-design-v2.md) for the technical design.

## Stack

- **Web**: Next.js 15 (App Router) + React Query + Zustand + ECharts
- **API**: NestJS 10 + SSE + Prisma
- **AI orchestration**: LangGraph.js (Planner / SQL / Review / Analyst / Chart)
- **Infrastructure**: PostgreSQL 16 + Docker sandbox (`ffp-sql-sandbox` digest image)

## Repository layout

```
ai-bi/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # NestJS API
├── packages/
│   ├── shared/       # Shared types (SSE events, DTOs)
│   └── db/           # Prisma schema and client
├── sandbox/          # SQL sandbox container image
└── docker-compose.yml
```

## Quick start (development)

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment variables
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux

# 3. Start PostgreSQL
docker compose up -d postgres

# 4. Run migrations and generate the Prisma client
pnpm db:migrate

# 5. Pull the SQL sandbox runner (digest pinned by ffp-sql-sandbox@0.1.5)
docker pull ghcr.io/ffp-tech-lab/ffp-sql-sandbox-runner@sha256:57767f4e80e9f5c6066eeaf996f3101c7ce4ea2740538c06523eeaaf0b15feb6

# 6. Start the web app and API (watch mode)
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000 (health check `GET /api/health`)

## Production

```bash
docker pull ghcr.io/ffp-tech-lab/ffp-sql-sandbox-runner@sha256:57767f4e80e9f5c6066eeaf996f3101c7ce4ea2740538c06523eeaaf0b15feb6
docker compose up -d postgres api web
pnpm db:deploy
```

Sandbox integration is described in [`apps/api/src/sandbox/ADR.md`](./apps/api/src/sandbox/ADR.md) (allowlist A, minimal host denylist, read-only R1).

The API depends on [`ffp-sql-sandbox@0.1.5`](https://github.com/FFP-Tech-Lab/ffp-sql-sandbox). That release pins the runner image above.

## License

[MIT](./LICENSE)
