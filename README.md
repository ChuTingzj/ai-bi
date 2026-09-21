# DataMind AI-BI 平台

企业级多智能体数据洞察平台：自然语言提问 → 多 Agent 协作生成 SQL → Docker 沙盒安全执行 → 自动图表 + 业务洞察。

技术设计详见 [technical-design-v2.md](./technical-design-v2.md)。

## 技术栈

- **前端**：Next.js 15 (App Router) + React Query + Zustand + ECharts
- **后端**：NestJS 10 + SSE + Prisma
- **AI 编排**：LangGraph.js（Planner / SQL / Review / Analyst / Chart 五 Agent）
- **基础设施**：PostgreSQL 16 + Docker 沙盒（`ffp-sql-sandbox` digest 镜像）

## 目录结构

```
ai-bi/
├── apps/
│   ├── web/          # Next.js 前端
│   └── api/          # NestJS 后端
├── packages/
│   ├── shared/       # 前后端共享类型（SSE 事件、DTO）
│   └── db/           # Prisma Schema 与 Client
├── sandbox/          # SQL 沙盒容器镜像
└── docker-compose.yml
```

## 快速启动（开发环境）

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux

# 3. 启动 PostgreSQL
docker compose up -d postgres

# 4. 数据库迁移 + 生成 Client
pnpm db:migrate

# 5. 预拉 SQL 沙盒 runner（digest 由 ffp-sql-sandbox@0.1.2 固定）
docker pull ghcr.io/ffp-tech-lab/ffp-sql-sandbox-runner:v1

# 6. 启动前后端（watch 模式）
pnpm dev
```

- 前端：http://localhost:3000
- 后端：http://localhost:4000（健康检查 `GET /api/health`）

## 生产部署

```bash
docker pull ghcr.io/ffp-tech-lab/ffp-sql-sandbox-runner:v1
docker compose up -d postgres api web
pnpm db:deploy
```

沙盒接入约定见 [`apps/api/src/sandbox/ADR.md`](./apps/api/src/sandbox/ADR.md)（allowlist A、最小 host denylist、只读 R1）。
