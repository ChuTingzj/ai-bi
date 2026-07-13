# DataMind AI-BI 完整前后端技术设计文档

> 版本：v2.0  
> 状态：可直接指导开发  
> 需求来源：[prd.md](./prd.md)  
> 初版参考：[technology-design.md](./technology-design.md)

---

## 目录

1. [系统概述与技术选型](#第-1-章系统概述与技术选型)
2. [整体架构设计](#第-2-章整体架构设计)
3. [前端技术设计（Next.js）](#第-3-章前端技术设计nextjs)
4. [后端技术设计（NestJS）](#第-4-章后端技术设计nestjs)
5. [AI 编排设计（LangGraph.js）](#第-5-章ai-编排设计langgraphjs)
6. [数据库设计（PostgreSQL + Prisma）](#第-6-章数据库设计postgresql--prisma)
7. [关键业务流程时序图](#第-7-章关键业务流程时序图)
8. [安全与运维](#第-8-章安全与运维)

---

## 第 1 章：系统概述与技术选型

### 1.1 产品定位

**DataMind AI-BI** 是一款企业级多智能体数据洞察平台，核心价值链为 **「对话即图表」**：

```
自然语言提问 → 多 Agent 协作生成 SQL → 沙盒安全执行 → 自动图表 + 业务洞察
```

| 维度 | 说明 |
|------|------|
| 产品名称 | DataMind AI-BI 平台 |
| 核心受众 | 产品经理、市场运营（自然语言查数） |
| 配置者 | DBA、数据分析师（数据源接入与 Schema 管理） |
| 核心痛点 | 传统 BI 依赖分析师写 SQL；单节点 LLM 易产生 SQL 幻觉 |
| 差异化能力 | LangGraph 多 Agent 自纠错 + Docker 沙盒隔离执行 |

### 1.2 PRD 模块与技术映射

| PRD 模块 | 技术栈 | 核心能力 |
|----------|--------|----------|
| 3.1 智能对话与图表渲染 | Next.js | SSE 流式对话、ECharts 动态渲染、Dashboard 收藏 |
| 3.2 多智能体工作流 | LangGraph.js | Planner / SQL / Review / Analyst / Chart 五 Agent |
| 3.3 数据安全与沙盒 | NestJS + Docker | 只读 SQL 执行、超时 Kill、资源隔离 |
| 3.4 会话记忆与持久化 | PostgreSQL + Prisma | 对话历史 + LangGraph Checkpointer |

### 1.3 技术选型

| 层级 | 技术 | 版本建议 | 选型理由 |
|------|------|----------|----------|
| 前端框架 | Next.js (App Router) | 15.x | RSC 首屏 SSR、Server/Client 组件分离、生产级路由 |
| UI 组件 | shadcn/ui + Tailwind CSS | latest | 可定制、无运行时依赖、与 Next.js 生态契合 |
| 图表 | ECharts | 5.x | 配置驱动、支持导出 PNG、后端 JSON 直接渲染 |
| 状态管理 | React Query + Zustand | 5.x / 4.x | 服务端状态与流式/UI 状态分离 |
| 后端框架 | NestJS | 10.x | 模块化 DI、装饰器、RxJS SSE 原生支持 |
| AI 编排 | LangGraph.js + LangChain | latest | 循环状态机、条件边、Checkpointer 持久化 |
| ORM | Prisma | 5.x | 类型安全、迁移管理、JSONB 支持 |
| 数据库 | PostgreSQL | 16.x | 关系型持久化 + JSONB 存 Agent 中间态 |
| SQL 沙盒 | Docker + dockerode | latest | 进程隔离、资源限制、网络隔离 |
| 共享类型 | Turborepo + packages/shared | — | 前后端 DTO、SSE 事件类型统一 |
| 通信协议 | REST + SSE | — | CRUD 用 REST；AI 流式响应用 SSE |

**为何不采用单体 Prompt Chain？**

- 单链无法表达「SQL 失败 → 重试」的循环逻辑
- 各 Agent 职责耦合，难以独立迭代 Prompt
- 缺少 Checkpointer，刷新页面即丢失中间态
- LangGraph 条件边可精确控制 retry 上限（3 次）与兜底分支

### 1.4 非功能性指标

| 指标 | 目标值 | 实现手段 |
|------|--------|----------|
| SSE 首 token 延迟 | < 2s | Planner 节点轻量化、LLM streaming |
| SQL 沙盒超时 | 10s | Docker `container.kill()` 强制终止 |
| SQL 自纠错上限 | 3 次 | LangGraph 条件边 `error_count < 3` |
| 用户级限流 | 10 req/min | NestJS `@Throttle(10, 60)` |
| 沙盒内存上限 | 128 MB | Docker `--memory=128m` |
| 会话恢复 | 刷新不丢失 | Message 表 + AgentCheckpoint 双写 |
| Token 有效期 | access 15min / refresh 7d | JWT 双 Token 策略 |

---

## 第 2 章：整体架构设计

### 2.1 四层架构

```mermaid
flowchart TB
  subgraph layer1 [展现层_NextJS]
    Pages[Pages_RSC]
    ChatUI[ChatArea_Client]
    ChartEngine[EChartsRenderer]
    DashboardUI[DashboardGrid]
  end

  subgraph layer2 [业务网关层_NestJS]
    AuthMod[AuthModule]
    SessionMod[SessionModule]
    ChatMod[ChatModule_SSE]
    DSMod[DataSourceModule]
    DashMod[DashboardModule]
  end

  subgraph layer3 [AI编排层_LangGraph]
    Planner[PlannerAgent]
    SQLAgent[SQLAgent]
    Review[ReviewAgent]
    Analyst[AnalystAgent]
    ChartAgent[ChartAgent]
  end

  subgraph layer4 [基础设施层]
    PG[(PostgreSQL)]
    DockerBox[DockerSandbox]
    LLM[LLM_API]
  end

  ChatUI -->|POST_SSE| ChatMod
  ChatMod --> layer3
  SQLAgent --> DockerBox
  DockerBox --> PG
  layer3 --> LLM
  layer3 --> PG
  AuthMod --> PG
  SessionMod --> PG
  DSMod --> PG
  DashMod --> PG
  Pages --> SessionMod
```

**各层职责：**

1. **展现层**：用户交互、SSE 流式渲染、Markdown + 图表解析、Dashboard 管理
2. **业务网关层**：鉴权、限流、会话 CRUD、数据源管理、SSE 长连接维持
3. **AI 编排层**：LangGraph 状态机，编排 5 个 Agent 的调用顺序与条件路由
4. **基础设施层**：PostgreSQL 持久化、Docker 沙盒执行、外部 LLM API

### 2.2 Monorepo 目录结构

```
ai-bi/
├── apps/
│   ├── web/                          # Next.js 15 前端
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── login/
│   │   │   ├── chat/[sessionId]/
│   │   │   ├── dashboard/
│   │   │   └── admin/datasources/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── package.json
│   │   └── next.config.ts
│   │
│   └── api/                          # NestJS 10 后端
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── auth/
│       │   ├── user/
│       │   ├── session/
│       │   ├── chat/
│       │   ├── agent/
│       │   │   ├── graph/
│       │   │   │   ├── nodes/
│       │   │   │   ├── edges/
│       │   │   │   └── bi-agent.graph.ts
│       │   │   └── agent.module.ts
│       │   ├── datasource/
│       │   ├── dashboard/
│       │   ├── sandbox/
│       │   └── prisma/
│       ├── package.json
│       └── nest-cli.json
│
├── packages/
│   ├── shared/                       # 前后端共享类型
│   │   ├── src/
│   │   │   ├── dto/
│   │   │   ├── sse-events.ts
│   │   │   ├── agent-types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── db/                           # Prisma 数据层
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── src/
│       │   └── index.ts
│       └── package.json
│
├── sandbox/                          # SQL 执行容器
│   ├── Dockerfile
│   ├── execute.js                    # 容器内 SQL 执行脚本
│   └── package.json
│
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
├── .env.example
└── package.json
```

### 2.3 服务间通信

| 通信路径 | 协议 | 说明 |
|----------|------|------|
| 浏览器 → NestJS | HTTPS + SSE | REST CRUD；`POST /api/chat/stream` 流式对话 |
| NestJS → LangGraph | 进程内调用 | `AgentModule.invokeWorkflow()` AsyncGenerator |
| LangGraph → Sandbox | 进程内调用 | `SandboxModule.execute(sql, dataSourceId)` |
| Sandbox → Docker | Docker API (dockerode) | 动态创建/销毁容器 |
| 容器 → 目标 DB | TCP (只读账号) | SELECT 查询，网络白名单 |
| NestJS → LLM | HTTPS | OpenAI 兼容 API |
| 全服务 → PostgreSQL | TCP 5432 | Prisma Client |

### 2.4 部署拓扑

```mermaid
flowchart LR
  User[Browser] --> Nginx[Nginx_ReverseProxy]
  Nginx --> Web[NextJS_:3000]
  Nginx --> API[NestJS_:4000]
  API --> PG[(PostgreSQL_:5432)]
  API --> Docker[DockerEngine]
  Docker --> Sandbox[SQL_Sandbox_Container]
  Sandbox --> TargetDB[(Target_ReadOnly_DB)]
  API --> LLM[LLM_API]
```

---

## 第 3 章：前端技术设计（Next.js）

### 3.1 路由与页面结构

| 路由 | 渲染类型 | 职责 | 数据获取方式 |
|------|----------|------|--------------|
| `/` | RSC | 会话列表，重定向至最近会话 | Server 直连 API / DB |
| `/login` | Client | JWT 登录表单 | — |
| `/chat/[sessionId]` | RSC + Client | 对话主界面 | RSC 预取历史消息；Client SSE 流式 |
| `/dashboard` | Client | 个人 Dashboard 图表墙 | React Query |
| `/admin/datasources` | Client | 数据源管理（ADMIN 角色） | React Query |

### 3.2 组件树

```
app/
├── layout.tsx                         # 根布局：AuthProvider + QueryClientProvider + Sidebar
├── page.tsx                           # 首页：会话列表 SSR
├── login/
│   └── page.tsx                       # 登录页
├── chat/
│   └── [sessionId]/
│       ├── page.tsx                   # RSC: 预取 session + messages
│       ├── loading.tsx
│       └── _components/
│           ├── ChatArea.tsx           # SSE 流式对话主容器
│           ├── MessageList.tsx        # 虚拟滚动消息列表
│           ├── MessageBubble.tsx      # 单条消息（user/assistant）
│           ├── ChatInput.tsx          # 输入框 + 发送按钮
│           ├── StreamingIndicator.tsx # Agent 步骤进度条
│           ├── SqlPreview.tsx         # 可选：展示生成的 SQL
│           └── ChartActions.tsx       # 导出 PNG / 加入 Dashboard
├── dashboard/
│   ├── page.tsx
│   └── _components/
│       ├── DashboardGrid.tsx          # react-grid-layout 可拖拽网格
│       └── ChartCard.tsx              # 单个图表卡片
├── admin/
│   └── datasources/
│       ├── page.tsx
│       └── _components/
│           ├── DataSourceList.tsx
│           ├── DataSourceForm.tsx     # 创建/编辑数据源
│           └── SchemaSyncButton.tsx   # 触发 Schema 同步
└── components/
    ├── markdown/
    │   ├── MarkdownRenderer.tsx       # react-markdown 入口
    │   └── EChartsBlock.tsx           # 拦截 ```echarts 代码块
    ├── charts/
    │   └── EChartsRenderer.tsx        # dynamic import, ssr: false
    ├── layout/
    │   ├── Sidebar.tsx                # 会话列表侧栏
    │   └── Header.tsx
    └── ui/                            # shadcn/ui 基础组件
```

### 3.3 状态管理策略

#### 3.3.1 服务端状态 — React Query

```typescript
// hooks/useSessions.ts
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<Session[]>('/api/sessions'),
  });
}

// hooks/useMessages.ts
export function useMessages(sessionId: string) {
  return useQuery({
    queryKey: ['messages', sessionId],
    queryFn: () => api.get<Message[]>(`/api/sessions/${sessionId}/messages`),
    enabled: !!sessionId,
  });
}
```

#### 3.3.2 流式状态 — useReducer（ChatArea 局部）

```typescript
type ChatStreamState = {
  isStreaming: boolean;
  currentStep: AgentStep | null;
  streamingContent: string;       // 正在拼接的 assistant 文本
  streamingChart: EChartsOption | null;
  error: string | null;
};

type ChatStreamAction =
  | { type: 'START' }
  | { type: 'STATUS'; step: AgentStep; message: string }
  | { type: 'TOKEN'; content: string }
  | { type: 'CHART'; config: EChartsOption }
  | { type: 'SQL'; query: string; status: string }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'DONE'; messageId: string }
  | { type: 'RESET' };
```

流式状态仅在 `ChatArea` 组件内维护，避免全局 store 污染；`DONE` 后 invalidate `['messages', sessionId]` 刷新历史。

#### 3.3.3 Dashboard 状态 — Zustand

```typescript
interface DashboardStore {
  charts: DashboardChart[];
  layout: GridLayoutItem[];
  setLayout: (layout: GridLayoutItem[]) => void;
  addChart: (chart: DashboardChart) => void;
  removeChart: (id: string) => void;
}
```

### 3.4 SSE 客户端协议

#### 3.4.1 共享事件类型（packages/shared/src/sse-events.ts）

```typescript
export type AgentStep =
  | 'planning'
  | 'fetching_schema'
  | 'generating_sql'
  | 'executing_sql'
  | 'generating_chart'
  | 'analyzing'
  | 'done';

export type SseEvent =
  | { type: 'token'; content: string }
  | { type: 'chart'; config: Record<string, unknown> }
  | { type: 'sql'; query: string; status: 'generated' | 'executing' | 'success' | 'error' }
  | { type: 'status'; step: AgentStep; message: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'done'; messageId: string };
```

#### 3.4.2 SSE 客户端实现

```typescript
// lib/sse-client.ts
export async function* streamChat(
  sessionId: string,
  message: string,
  dataSourceId?: string,
): AsyncGenerator<SseEvent> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({ sessionId, message, dataSourceId }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        yield JSON.parse(data) as SseEvent;
      }
    }
  }
}
```

**为何使用 fetch + ReadableStream 而非 EventSource？**

- `EventSource` 仅支持 GET，无法携带 JSON body
- `fetch` 支持 POST + Authorization header
- 可在请求中断时调用 `AbortController`

### 3.5 动态图表渲染协议

#### 3.5.1 后端输出格式

Analyst Agent 输出 Markdown 文本，Chart Agent 将 ECharts 配置嵌入代码块：

````markdown
根据过去三个月的数据，华东区销售额呈上升趋势，华南区相对平稳。

```echarts
{
  "title": { "text": "华东区 vs 华南区销售额趋势" },
  "tooltip": { "trigger": "axis" },
  "legend": { "data": ["华东区", "华南区"] },
  "xAxis": { "type": "category", "data": ["4月", "5月", "6月"] },
  "yAxis": { "type": "value", "name": "销售额（万元）" },
  "series": [
    { "name": "华东区", "type": "line", "data": [120, 150, 180] },
    { "name": "华南区", "type": "line", "data": [90, 95, 100] }
  ]
}
```
````

#### 3.5.2 前端解析流程

```typescript
// components/markdown/MarkdownRenderer.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EChartsBlock } from './EChartsBlock';

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          if (match?.[1] === 'echarts') {
            try {
              const config = JSON.parse(String(children).replace(/\n$/, ''));
              return <EChartsBlock config={config} />;
            } catch {
              return <pre className={className} {...props}>{children}</pre>;
            }
          }
          return <code className={className} {...props}>{children}</code>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

```typescript
// components/charts/EChartsRenderer.tsx
'use client';
import dynamic from 'next/dynamic';
import { useRef } from 'react';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export function EChartsRenderer({ config }: { config: Record<string, unknown> }) {
  const chartRef = useRef<InstanceType<typeof ReactECharts>>(null);

  const exportPng = () => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;
    const url = instance.getDataURL({ type: 'png', pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = 'chart.png';
    link.href = url;
    link.click();
  };

  return (
    <div className="relative group">
      <ReactECharts ref={chartRef} option={config} style={{ height: 400 }} />
      <button onClick={exportPng} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100">
        导出 PNG
      </button>
    </div>
  );
}
```

#### 3.5.3 图表收藏至 Dashboard

```typescript
// components/chat/ChartActions.tsx
async function addToDashboard(messageId: string, chartConfig: object, title: string) {
  await api.post('/api/dashboard/charts', {
    sourceMessageId: messageId,
    title,
    chartConfig,
    position: { x: 0, y: 0, w: 6, h: 4 },
  });
  toast.success('已加入 Dashboard');
}
```

### 3.6 关键前端依赖

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.0.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "echarts": "^5.5.0",
    "echarts-for-react": "^3.0.0",
    "react-grid-layout": "^1.4.0",
    "zod": "^3.23.0",
    "@ai-bi/shared": "workspace:*"
  }
}
```

### 3.7 环境变量（前端）

```env
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 第 4 章：后端技术设计（NestJS）

### 4.1 模块划分

```
AppModule
├── PrismaModule          # 全局 Prisma Client 注入
├── AuthModule            # JWT 签发/校验、bcrypt
├── UserModule            # 用户 CRUD
├── SessionModule         # 会话管理
├── ChatModule            # SSE 流式对话入口
├── AgentModule           # LangGraph 工作流封装
│   └── SandboxModule     # Docker SQL 沙盒（AgentModule 依赖）
├── DataSourceModule      # 数据源接入/Schema 同步
└── DashboardModule       # Dashboard 图表收藏
```

| 模块 | 核心类 | 职责 |
|------|--------|------|
| `AuthModule` | `AuthController`, `AuthService`, `JwtStrategy` | 注册/登录/刷新 Token |
| `UserModule` | `UserService` | 用户查询 |
| `SessionModule` | `SessionController`, `SessionService` | 会话 CRUD、消息分页 |
| `ChatModule` | `ChatController`, `ChatService` | SSE 端点、限流、消息持久化 |
| `AgentModule` | `AgentService`, `BiAgentGraph` | LangGraph 编排 |
| `SandboxModule` | `SandboxService` | Docker 容器生命周期管理 |
| `DataSourceModule` | `DataSourceController`, `DataSourceService` | 数据源 CRUD、连接测试、Schema 同步 |
| `DashboardModule` | `DashboardController`, `DashboardService` | 图表收藏管理 |

### 4.2 统一响应格式

```typescript
// packages/shared/src/dto/api-response.ts
export interface ApiResponse<T = unknown> {
  code: number;       // 0 = 成功，非 0 = 错误码
  data?: T;
  message?: string;
}

// 错误码定义
export enum ErrorCode {
  SUCCESS = 0,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  VALIDATION_ERROR = 422,
  RATE_LIMITED = 429,
  INTERNAL_ERROR = 500,
  SQL_SANDBOX_ERROR = 1001,
  DATASOURCE_CONNECTION_FAILED = 1002,
  AGENT_MAX_RETRY_EXCEEDED = 1003,
}
```

### 4.3 完整 API 契约

#### 4.3.1 认证接口

**POST /api/auth/register**

```json
// Request
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "张三"
}

// Response 200
{
  "code": 0,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "张三",
    "role": "USER"
  }
}
```

**POST /api/auth/login**

```json
// Request
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

// Response 200
{
  "code": 0,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "expiresIn": 900
  }
}
```

**POST /api/auth/refresh**

```json
// Request
{ "refreshToken": "eyJhbG..." }

// Response 200
{
  "code": 0,
  "data": {
    "accessToken": "eyJhbG...",
    "expiresIn": 900
  }
}
```

#### 4.3.2 会话接口

**GET /api/sessions**

```json
// Response 200
{
  "code": 0,
  "data": [
    {
      "id": "session-uuid",
      "title": "华东华南销售额对比",
      "dataSourceId": "ds-uuid",
      "dataSourceName": "生产数据库",
      "createdAt": "2026-07-13T10:00:00Z",
      "updatedAt": "2026-07-13T11:30:00Z"
    }
  ]
}
```

**POST /api/sessions**

```json
// Request
{
  "title": "新对话",
  "dataSourceId": "ds-uuid"
}

// Response 201
{
  "code": 0,
  "data": {
    "id": "session-uuid",
    "title": "新对话",
    "dataSourceId": "ds-uuid",
    "createdAt": "2026-07-13T12:00:00Z"
  }
}
```

**GET /api/sessions/:id/messages?page=1&limit=50**

```json
// Response 200
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "msg-uuid",
        "role": "USER",
        "content": "对比过去三个月华东区和华南区的销售额趋势",
        "createdAt": "2026-07-13T12:00:00Z"
      },
      {
        "id": "msg-uuid-2",
        "role": "ASSISTANT",
        "content": "根据过去三个月的数据...",
        "sqlQuery": "SELECT region, month, SUM(amount) ...",
        "chartConfig": { "title": { "text": "..." }, "series": [...] },
        "createdAt": "2026-07-13T12:00:15Z"
      }
    ],
    "total": 2,
    "page": 1,
    "limit": 50
  }
}
```

**DELETE /api/sessions/:id**

```json
// Response 200
{ "code": 0, "data": { "deleted": true } }
```

#### 4.3.3 对话接口（核心）

**POST /api/chat/stream**

```
Content-Type: application/json
Authorization: Bearer <accessToken>
Accept: text/event-stream
```

```json
// Request
{
  "sessionId": "session-uuid",
  "message": "对比过去三个月华东区和华南区的销售额趋势",
  "dataSourceId": "ds-uuid"
}
```

```
// Response: text/event-stream

data: {"type":"status","step":"planning","message":"正在理解您的问题..."}

data: {"type":"status","step":"fetching_schema","message":"正在检索相关表结构..."}

data: {"type":"sql","query":"SELECT region, DATE_TRUNC('month', order_date) AS month, SUM(amount) FROM orders WHERE region IN ('华东区','华南区') AND order_date >= NOW() - INTERVAL '3 months' GROUP BY 1, 2 ORDER BY 2","status":"generated"}

data: {"type":"status","step":"executing_sql","message":"正在沙盒中执行 SQL..."}

data: {"type":"sql","query":"SELECT ...","status":"success"}

data: {"type":"status","step":"generating_chart","message":"正在生成图表..."}

data: {"type":"chart","config":{"title":{"text":"华东区 vs 华南区销售额趋势"},"xAxis":{...},"series":[...]}}

data: {"type":"status","step":"analyzing","message":"正在生成业务洞察..."}

data: {"type":"token","content":"根据"}

data: {"type":"token","content":"过去三个月"}

data: {"type":"token","content":"的数据..."}

data: {"type":"done","messageId":"msg-uuid-new"}

data: [DONE]
```

**错误场景 SSE 事件：**

```
data: {"type":"sql","query":"SELECT ...","status":"error"}

data: {"type":"status","step":"generating_sql","message":"SQL 执行失败，正在第 1 次重试..."}

data: {"type":"error","code":"1003","message":"SQL 生成失败，已重试 3 次仍无法执行，请尝试简化您的问题。"}

data: [DONE]
```

#### 4.3.4 数据源接口

**GET /api/datasources**

```json
// Response 200
{
  "code": 0,
  "data": [
    {
      "id": "ds-uuid",
      "name": "生产数据库",
      "type": "postgresql",
      "host": "db.example.com",
      "port": 5432,
      "username": "readonly_user",
      "isReadOnly": true,
      "connectionStatus": "CONNECTED",
      "lastSyncAt": "2026-07-12T08:00:00Z",
      "createdAt": "2026-06-01T00:00:00Z"
    }
  ]
}
```

**POST /api/datasources**

```json
// Request
{
  "name": "生产数据库",
  "type": "postgresql",
  "host": "db.example.com",
  "port": 5432,
  "username": "readonly_user",
  "password": "secret",
  "isReadOnly": true
}

// Response 201
{
  "code": 0,
  "data": {
    "id": "ds-uuid",
    "name": "生产数据库",
    "connectionStatus": "CONNECTED",
    "message": "连接测试成功"
  }
}
```

**PUT /api/datasources/:id** — 同 POST 字段，password 可选（不传则保留原密码）

**DELETE /api/datasources/:id**

```json
// Response 200
{ "code": 0, "data": { "deleted": true } }
```

**POST /api/datasources/:id/sync-schema**

```json
// Response 200
{
  "code": 0,
  "data": {
    "syncedAt": "2026-07-13T12:00:00Z",
    "tableCount": 42,
    "schemaDoc": "CREATE TABLE orders (...);\nCREATE TABLE products (...);\n..."
  }
}
```

#### 4.3.5 Dashboard 接口

**GET /api/dashboard/charts**

```json
// Response 200
{
  "code": 0,
  "data": [
    {
      "id": "chart-uuid",
      "title": "华东华南销售额趋势",
      "chartConfig": { "title": {...}, "series": [...] },
      "sourceMessageId": "msg-uuid",
      "position": { "x": 0, "y": 0, "w": 6, "h": 4 },
      "createdAt": "2026-07-13T12:30:00Z"
    }
  ]
}
```

**POST /api/dashboard/charts**

```json
// Request
{
  "title": "华东华南销售额趋势",
  "chartConfig": { "title": {...}, "series": [...] },
  "sourceMessageId": "msg-uuid",
  "position": { "x": 0, "y": 0, "w": 6, "h": 4 }
}

// Response 201
{
  "code": 0,
  "data": {
    "id": "chart-uuid",
    "title": "华东华南销售额趋势",
    "createdAt": "2026-07-13T12:30:00Z"
  }
}
```

**DELETE /api/dashboard/charts/:id**

```json
// Response 200
{ "code": 0, "data": { "deleted": true } }
```

#### 4.3.6 健康检查

**GET /api/health**

```json
{
  "code": 0,
  "data": {
    "status": "ok",
    "timestamp": "2026-07-13T12:00:00Z",
    "services": {
      "database": "connected",
      "docker": "available"
    }
  }
}
```

### 4.4 ChatModule SSE 实现

```typescript
// apps/api/src/chat/chat.controller.ts
@Controller('api/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('stream')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Sse()
  async stream(
    @Body() dto: ChatStreamDto,
    @CurrentUser() user: UserPayload,
  ): Promise<Observable<MessageEvent>> {
    return this.chatService.handleStream(dto, user);
  }
}
```

```typescript
// apps/api/src/chat/chat.service.ts
@Injectable()
export class ChatService {
  constructor(
    private readonly agentService: AgentService,
    private readonly prisma: PrismaService,
  ) {}

  handleStream(dto: ChatStreamDto, user: UserPayload): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      (async () => {
        // 1. 保存用户消息
        await this.prisma.message.create({
          data: {
            sessionId: dto.sessionId,
            role: 'USER',
            content: dto.message,
          },
        });

        let fullContent = '';
        let chartConfig: object | null = null;
        let sqlQuery: string | null = null;

        // 2. 调用 Agent 工作流
        const generator = this.agentService.invokeWorkflow({
          sessionId: dto.sessionId,
          question: dto.message,
          dataSourceId: dto.dataSourceId,
          userId: user.id,
        });

        for await (const event of generator) {
          subscriber.next({ data: JSON.stringify(event) });

          if (event.type === 'token') fullContent += event.content;
          if (event.type === 'chart') chartConfig = event.config;
          if (event.type === 'sql' && event.status === 'generated') sqlQuery = event.query;
        }

        // 3. 保存 assistant 消息
        const message = await this.prisma.message.create({
          data: {
            sessionId: dto.sessionId,
            role: 'ASSISTANT',
            content: fullContent,
            chartConfig: chartConfig ?? undefined,
            sqlQuery: sqlQuery ?? undefined,
          },
        });

        subscriber.next({
          data: JSON.stringify({ type: 'done', messageId: message.id }),
        });
        subscriber.next({ data: '[DONE]' });
        subscriber.complete();
      })().catch((err) => {
        subscriber.next({
          data: JSON.stringify({
            type: 'error',
            code: '500',
            message: err.message,
          }),
        });
        subscriber.complete();
      });
    });
  }
}
```

### 4.5 SandboxModule 安全设计

#### 4.5.1 SQL 静态校验

```typescript
// apps/api/src/sandbox/sql-validator.ts
const FORBIDDEN_PATTERNS = [
  /\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i,
  /\b(EXEC|EXECUTE|xp_)\b/i,
  /;\s*\w/i,  // 多语句注入
];

const ALLOWED_PREFIX = /^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN)\b/i;

export function validateSql(sql: string): { valid: boolean; reason?: string } {
  const trimmed = sql.trim();

  if (!ALLOWED_PREFIX.test(trimmed)) {
    return { valid: false, reason: 'Only SELECT/WITH/SHOW/DESCRIBE/EXPLAIN statements are allowed' };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `Forbidden SQL pattern detected: ${pattern}` };
    }
  }

  return { valid: true };
}
```

#### 4.5.2 Docker 沙盒执行流程

```typescript
// apps/api/src/sandbox/sandbox.service.ts
@Injectable()
export class SandboxService {
  private docker = new Docker();

  async execute(sql: string, dataSource: DataSource): Promise<SandboxResult> {
    const validation = validateSql(sql);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const container = await this.docker.createContainer({
      Image: 'ai-bi-sandbox:latest',
      Cmd: ['node', 'execute.js', sql],
      Env: [
        `DB_TYPE=${dataSource.type}`,
        `DB_HOST=${dataSource.host}`,
        `DB_PORT=${dataSource.port}`,
        `DB_USER=${dataSource.username}`,
        `DB_PASS=${decrypt(dataSource.password)}`,
        `DB_NAME=${dataSource.database}`,
        `QUERY_TIMEOUT=10000`,
      ],
      HostConfig: {
        Memory: 128 * 1024 * 1024,
        MemorySwap: 128 * 1024 * 1024,
        NanoCpus: 0.5 * 1e9,
        NetworkMode: 'none',
        AutoRemove: true,
      },
    });

    try {
      await container.start();

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SQL execution timeout (10s)')), 10_000),
      );

      const result = await Promise.race([
        this.collectOutput(container),
        timeout,
      ]);

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      try { await container.kill(); } catch { /* already stopped */ }
    }
  }
}
```

#### 4.5.3 沙盒容器脚本

```javascript
// sandbox/execute.js
const { Client } = require('pg'); // or mysql2 based on DB_TYPE

const sql = process.argv[2];
const timeout = parseInt(process.env.QUERY_TIMEOUT || '10000');

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  statement_timeout: timeout,
  connectionTimeoutMillis: 5000,
});

async function main() {
  await client.connect();
  const result = await client.query(sql);
  console.log(JSON.stringify({
    columns: result.fields.map(f => f.name),
    rows: result.rows,
    rowCount: result.rowCount,
  }));
  await client.end();
  process.exit(0);
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
```

---

## 第 5 章：AI 编排设计（LangGraph.js）

### 5.1 完整状态定义

```typescript
// packages/shared/src/agent-types.ts
import { BaseMessage } from '@langchain/core/messages';

export interface QueryIntent {
  summary: string;
  metrics: string[];
  dimensions: string[];
  filters: string[];
  timeRange?: string;
  chartType?: 'line' | 'bar' | 'pie' | 'table';
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface BiAgentState {
  messages: BaseMessage[];
  question: string;
  intent: QueryIntent | null;
  relevant_tables: string[];
  table_schema: string;
  generated_sql: string;
  sql_result: QueryResult | null;
  sql_error: string | null;
  analysis: string;
  chart_config: Record<string, unknown> | null;
  error_count: number;
  data_source_id: string;
  session_id: string;
}
```

### 5.2 节点与 PRD Agent 映射

| PRD Agent | LangGraph Node | 输入 | 输出 | LLM 调用 |
|-----------|---------------|------|------|----------|
| Planner Agent | `plannerNode` | question, schemaDoc 摘要 | intent, relevant_tables | 是 |
| — | `schemaFetcherNode` | relevant_tables, dataSourceId | table_schema (DDL) | 否（DB 查询） |
| SQL Agent | `sqlGeneratorNode` | intent, table_schema, sql_error | generated_sql | 是 |
| Review Agent | `sqlExecutorNode` | generated_sql | sql_result / sql_error | 否（沙盒执行） |
| Chart Agent | `chartGeneratorNode` | sql_result, intent | chart_config | 是 |
| Analyst Agent | `analystNode` | sql_result, question, chart_config | analysis (Markdown) | 是（streaming） |
| — | `fallbackNode` | sql_error, error_count | 兜底回复 | 是 |

### 5.3 状态机流转

```mermaid
stateDiagram-v2
  [*] --> plannerNode
  plannerNode --> schemaFetcherNode
  schemaFetcherNode --> sqlGeneratorNode
  sqlGeneratorNode --> sqlExecutorNode
  sqlExecutorNode --> chartGeneratorNode: success
  sqlExecutorNode --> sqlGeneratorNode: error且error_count小于3
  sqlExecutorNode --> fallbackNode: error且error_count大于等于3
  chartGeneratorNode --> analystNode
  analystNode --> [*]
  fallbackNode --> [*]
```

### 5.4 Graph 构建代码

```typescript
// apps/api/src/agent/graph/bi-agent.graph.ts
import { StateGraph, END } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

export function buildBiAgentGraph(
  nodes: BiAgentNodes,
  checkpointer: PostgresSaver,
) {
  const graph = new StateGraph<BiAgentState>({
    channels: {
      messages: { reducer: (a, b) => a.concat(b), default: () => [] },
      question: { reducer: (_, b) => b, default: () => '' },
      intent: { reducer: (_, b) => b, default: () => null },
      relevant_tables: { reducer: (_, b) => b, default: () => [] },
      table_schema: { reducer: (_, b) => b, default: () => '' },
      generated_sql: { reducer: (_, b) => b, default: () => '' },
      sql_result: { reducer: (_, b) => b, default: () => null },
      sql_error: { reducer: (_, b) => b, default: () => null },
      analysis: { reducer: (_, b) => b, default: () => '' },
      chart_config: { reducer: (_, b) => b, default: () => null },
      error_count: { reducer: (a, b) => b ?? a, default: () => 0 },
      data_source_id: { reducer: (_, b) => b, default: () => '' },
      session_id: { reducer: (_, b) => b, default: () => '' },
    },
  });

  graph
    .addNode('planner', nodes.plannerNode)
    .addNode('schemaFetcher', nodes.schemaFetcherNode)
    .addNode('sqlGenerator', nodes.sqlGeneratorNode)
    .addNode('sqlExecutor', nodes.sqlExecutorNode)
    .addNode('chartGenerator', nodes.chartGeneratorNode)
    .addNode('analyst', nodes.analystNode)
    .addNode('fallback', nodes.fallbackNode);

  graph
    .addEdge('__start__', 'planner')
    .addEdge('planner', 'schemaFetcher')
    .addEdge('schemaFetcher', 'sqlGenerator')
    .addEdge('sqlGenerator', 'sqlExecutor')
    .addConditionalEdges('sqlExecutor', (state) => {
      if (state.sql_result) return 'chartGenerator';
      if (state.error_count < 3) return 'sqlGenerator';
      return 'fallback';
    })
    .addEdge('chartGenerator', 'analyst')
    .addEdge('analyst', END)
    .addEdge('fallback', END);

  return graph.compile({ checkpointer });
}
```

### 5.5 条件边路由逻辑

```typescript
// apps/api/src/agent/graph/edges/sql-router.ts
export function routeAfterSqlExecution(state: BiAgentState): string {
  if (state.sql_result && !state.sql_error) {
    return 'chartGenerator';
  }

  if (state.error_count < 3) {
    return 'sqlGenerator';  // Review Agent 纠错：携带 sql_error 重试
  }

  return 'fallback';
}
```

### 5.6 各 Agent Prompt 模板

#### 5.6.1 Planner Agent

```
System:
你是一个数据分析规划专家。根据用户的自然语言问题，分析其查询意图。

输出 JSON 格式：
{
  "summary": "一句话概括查询目标",
  "metrics": ["需要查询的指标"],
  "dimensions": ["分组维度"],
  "filters": ["筛选条件"],
  "timeRange": "时间范围（如有）",
  "chartType": "建议图表类型: line|bar|pie|table",
  "relevant_tables": ["需要查询的表名"]
}

User:
问题：{question}
可用表摘要：{schema_summary}
```

#### 5.6.2 SQL Agent

```
System:
你是一个 SQL 生成专家。根据查询意图和表结构生成 PostgreSQL 查询语句。

规则：
1. 只输出纯 SQL，不要任何解释或 markdown 标记
2. 只允许 SELECT / WITH 语句
3. 使用表结构中存在的列名，不要臆造
4. 如果提供了上一次的错误信息，请根据错误修正 SQL

表结构：
{table_schema}

User:
查询意图：{intent_json}

{sql_error ? "上一次执行错误：" + sql_error : ""}
```

#### 5.6.3 Review Agent（sqlExecutorNode 实现，非 LLM）

Review Agent 不调用 LLM，而是：
1. 调用 `SandboxModule.execute(generated_sql, dataSource)`
2. 成功 → 写入 `sql_result`，清空 `sql_error`
3. 失败 → 写入 `sql_error`，`error_count += 1`

#### 5.6.4 Chart Agent

```
System:
你是一个数据可视化专家。根据查询结果生成 ECharts 配置 JSON。

规则：
1. 只输出纯 JSON，符合 ECharts option 格式
2. 根据数据特征选择合适图表类型（{chartType}）
3. 包含 title、tooltip、legend、xAxis、yAxis、series
4. 数据直接填入 series，不要引用外部数据源

User:
查询意图：{intent_json}
查询结果列：{columns}
查询结果数据（前 100 行）：{rows_json}
```

#### 5.6.5 Analyst Agent

```
System:
你是一个资深数据分析师。根据查询结果生成简洁的业务洞察。

规则：
1. 使用 Markdown 格式输出
2. 包含：核心发现（1-2 句）、数据解读（3-5 句）、建议（如有）
3. 数字要具体，引用实际数据
4. 不要重复图表已展示的信息，聚焦洞察

User:
用户问题：{question}
查询结果摘要：{result_summary}
```

### 5.7 AgentService 与 SSE 事件发射

```typescript
// apps/api/src/agent/agent.service.ts
@Injectable()
export class AgentService {
  async *invokeWorkflow(input: WorkflowInput): AsyncGenerator<SseEvent> {
    const graph = this.compiledGraph;

    const stream = await graph.stream(
      {
        question: input.question,
        data_source_id: input.dataSourceId,
        session_id: input.sessionId,
        error_count: 0,
      },
      { configurable: { thread_id: input.sessionId } },
    );

    for await (const event of stream) {
      const nodeName = Object.keys(event)[0];
      const state = event[nodeName] as Partial<BiAgentState>;

      switch (nodeName) {
        case 'planner':
          yield { type: 'status', step: 'planning', message: '正在理解您的问题...' };
          break;
        case 'schemaFetcher':
          yield { type: 'status', step: 'fetching_schema', message: '正在检索相关表结构...' };
          break;
        case 'sqlGenerator':
          yield { type: 'status', step: 'generating_sql', message: state.error_count ? `SQL 执行失败，正在第 ${state.error_count} 次重试...` : '正在生成 SQL...' };
          if (state.generated_sql) {
            yield { type: 'sql', query: state.generated_sql, status: 'generated' };
          }
          break;
        case 'sqlExecutor':
          yield { type: 'status', step: 'executing_sql', message: '正在沙盒中执行 SQL...' };
          if (state.sql_result) {
            yield { type: 'sql', query: state.generated_sql!, status: 'success' };
          }
          break;
        case 'chartGenerator':
          yield { type: 'status', step: 'generating_chart', message: '正在生成图表...' };
          if (state.chart_config) {
            yield { type: 'chart', config: state.chart_config };
          }
          break;
        case 'analyst':
          yield { type: 'status', step: 'analyzing', message: '正在生成业务洞察...' };
          // Analyst 输出通过 LLM streaming 逐 token 发射
          for await (const token of this.streamAnalysis(state)) {
            yield { type: 'token', content: token };
          }
          break;
        case 'fallback':
          yield { type: 'error', code: '1003', message: 'SQL 生成失败，已重试 3 次仍无法执行，请尝试简化您的问题。' };
          break;
      }
    }
  }
}
```

### 5.8 Checkpointer 持久化

```typescript
// apps/api/src/agent/agent.module.ts
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

@Module({
  providers: [
    {
      provide: 'CHECKPOINTER',
      useFactory: async () => {
        const saver = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
        await saver.setup();
        return saver;
      },
    },
    AgentService,
  ],
  exports: [AgentService],
})
export class AgentModule {}
```

- `threadId` = `sessionId`，每个会话对应一个 LangGraph 线程
- 每个节点执行后自动将 `BiAgentState` 快照写入 `AgentCheckpoint` 表
- 用户刷新页面时，进行中的 Agent 流程可从最近 checkpoint 恢复
- 与 `Message` 表形成双写：Message 存最终对话结果，Checkpoint 存中间态

---

## 第 6 章：数据库设计（PostgreSQL + Prisma）

### 6.1 完整 Prisma Schema

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  USER
  ADMIN
}

enum MessageRole {
  USER
  ASSISTANT
}

enum DataSourceType {
  POSTGRESQL
  MYSQL
}

enum ConnectionStatus {
  CONNECTED
  DISCONNECTED
  ERROR
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  name         String
  role         UserRole @default(USER)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  sessions        Session[]
  dataSources     DataSource[]
  dashboardCharts DashboardChart[]

  @@map("users")
}

model DataSource {
  id               String           @id @default(uuid())
  userId           String           @map("user_id")
  name             String
  type             DataSourceType
  host             String
  port             Int
  database         String           @default("")
  username         String
  password         String           // AES-256-GCM 加密存储
  isReadOnly       Boolean          @default(true) @map("is_read_only")
  schemaDoc        String?          @map("schema_doc") @db.Text
  connectionStatus ConnectionStatus @default(DISCONNECTED) @map("connection_status")
  lastSyncAt       DateTime?        @map("last_sync_at")
  createdAt        DateTime         @default(now()) @map("created_at")
  updatedAt        DateTime         @updatedAt @map("updated_at")

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  sessions Session[]

  @@index([userId])
  @@map("data_sources")
}

model Session {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  dataSourceId String?  @map("data_source_id")
  title        String   @default("新对话")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  dataSource      DataSource?      @relation(fields: [dataSourceId], references: [id], onDelete: SetNull)
  messages        Message[]
  agentCheckpoint AgentCheckpoint?

  @@index([userId, createdAt(sort: Desc)])
  @@map("sessions")
}

model Message {
  id          String      @id @default(uuid())
  sessionId   String      @map("session_id")
  role        MessageRole
  content     String      @db.Text
  sqlQuery    String?     @map("sql_query") @db.Text
  chartConfig Json?       @map("chart_config")
  createdAt   DateTime    @default(now()) @map("created_at")

  session         Session          @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  dashboardCharts DashboardChart[]

  @@index([sessionId, createdAt])
  @@map("messages")
}

model DashboardChart {
  id              String   @id @default(uuid())
  userId          String   @map("user_id")
  title           String
  chartConfig     Json     @map("chart_config")
  sourceMessageId String?  @map("source_message_id")
  position        Json     @default("{\"x\":0,\"y\":0,\"w\":6,\"h\":4}")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  sourceMessage Message? @relation(fields: [sourceMessageId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@map("dashboard_charts")
}

model AgentCheckpoint {
  threadId  String   @id @map("thread_id")
  sessionId String   @unique @map("session_id")
  state     Json
  updatedAt DateTime @updatedAt @map("updated_at")

  session Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("agent_checkpoints")
}
```

### 6.2 ER 关系图

```mermaid
erDiagram
  User ||--o{ Session : owns
  User ||--o{ DataSource : manages
  User ||--o{ DashboardChart : collects
  Session ||--o{ Message : contains
  Session ||--o| AgentCheckpoint : persists
  Session }o--|| DataSource : uses
  Message ||--o{ DashboardChart : sources
  DataSource {
    uuid id PK
    string name
    enum type
    string host
    int port
    string password_encrypted
    text schema_doc
    enum connection_status
  }
  Session {
    uuid id PK
    uuid user_id FK
    uuid data_source_id FK
    string title
  }
  Message {
    uuid id PK
    uuid session_id FK
    enum role
    text content
    json chart_config
    text sql_query
  }
  AgentCheckpoint {
    string thread_id PK
    uuid session_id FK
    jsonb state
  }
  DashboardChart {
    uuid id PK
    uuid user_id FK
    json chart_config
    json position
  }
```

### 6.3 索引策略

| 表 | 索引 | 用途 |
|----|------|------|
| `sessions` | `(user_id, created_at DESC)` | 用户会话列表按时间倒序 |
| `messages` | `(session_id, created_at)` | 会话内消息按时间正序分页 |
| `data_sources` | `(user_id)` | 用户数据源列表 |
| `dashboard_charts` | `(user_id)` | 用户 Dashboard 图表列表 |
| `users` | `(email)` UNIQUE | 登录查询 |

### 6.4 敏感数据加密

```typescript
// apps/api/src/common/crypto.service.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, tagHex, encHex] = ciphertext.split(':');
    const decipher = createDecipheriv(this.algorithm, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  }
}
```

- `DataSource.password` 写入前 `encrypt()`，读取时 `decrypt()`
- `ENCRYPTION_KEY` 为 32 字节 hex 字符串，通过环境变量注入
- `User.passwordHash` 使用 bcrypt（cost factor 12），不可逆

---

## 第 7 章：关键业务流程时序图

### 7.1 完整对话查询流程

```mermaid
sequenceDiagram
  participant User as 用户浏览器
  participant Web as NextJS_ChatArea
  participant API as NestJS_ChatModule
  participant Agent as LangGraph_AgentModule
  participant Sandbox as Docker_Sandbox
  participant DB as PostgreSQL
  participant LLM as LLM_API

  User->>Web: 输入问题并发送
  Web->>API: POST /api/chat/stream
  API->>DB: 保存 USER Message
  API->>Agent: invokeWorkflow(sessionId, question)

  Agent->>LLM: plannerNode 理解意图
  Agent-->>API: SSE status:planning
  API-->>Web: data: status planning
  Web-->>User: 显示"正在理解您的问题..."

  Agent->>DB: schemaFetcherNode 获取 DDL
  Agent-->>API: SSE status:fetching_schema
  API-->>Web: data: status fetching_schema

  Agent->>LLM: sqlGeneratorNode 生成 SQL
  Agent-->>API: SSE sql:generated
  API-->>Web: data: sql generated

  Agent->>Sandbox: sqlExecutorNode 执行 SQL
  Sandbox->>DB: SELECT query
  DB-->>Sandbox: result JSON
  Sandbox-->>Agent: success + rows
  Agent-->>API: SSE sql:success
  API-->>Web: data: sql success

  Agent->>LLM: chartGeneratorNode 生成图表
  Agent-->>API: SSE chart config
  API-->>Web: data: chart
  Web-->>User: 渲染 ECharts 图表

  Agent->>LLM: analystNode 流式分析
  loop 每个 token
    Agent-->>API: SSE token
    API-->>Web: data: token
    Web-->>User: 流式打字效果
  end

  API->>DB: 保存 ASSISTANT Message
  API->>DB: 更新 AgentCheckpoint
  Agent-->>API: done
  API-->>Web: data: done + DONE
  Web-->>User: 对话完成
```

### 7.2 SQL 自纠错循环

```mermaid
sequenceDiagram
  participant Agent as LangGraph
  participant SQL as sqlGeneratorNode
  participant Exec as sqlExecutorNode
  participant Sandbox as Docker_Sandbox
  participant LLM as LLM_API

  Agent->>SQL: 第 1 次生成 SQL
  SQL->>LLM: prompt(intent + schema)
  LLM-->>SQL: SELECT ... FROM orderss
  SQL->>Exec: generated_sql
  Exec->>Sandbox: execute(sql)
  Sandbox-->>Exec: error: relation "orderss" does not exist
  Exec-->>Agent: sql_error, error_count=1

  Note over Agent: 条件边: error_count小于3, 回到 sqlGenerator

  Agent->>SQL: 第 2 次生成 SQL
  SQL->>LLM: prompt(intent + schema + error)
  LLM-->>SQL: SELECT ... FROM orders
  SQL->>Exec: generated_sql
  Exec->>Sandbox: execute(sql)
  Sandbox-->>Exec: success + rows
  Exec-->>Agent: sql_result, error_count=1

  Note over Agent: 条件边: success, 流转到 chartGenerator
```

### 7.3 数据源接入流程

```mermaid
sequenceDiagram
  participant Admin as DBA浏览器
  participant API as DataSourceModule
  participant Crypto as CryptoService
  participant TargetDB as 目标数据库
  participant DB as PostgreSQL

  Admin->>API: POST /api/datasources
  API->>TargetDB: 测试连接 TCP + 认证
  alt 连接成功
    TargetDB-->>API: OK
    API->>Crypto: encrypt(password)
    API->>DB: INSERT DataSource
    API-->>Admin: connectionStatus: CONNECTED
  else 连接失败
    TargetDB-->>API: Connection refused
    API-->>Admin: code 1002, 连接失败
  end

  Admin->>API: POST /api/datasources/:id/sync-schema
  API->>TargetDB: INFORMATION_SCHEMA 查询
  TargetDB-->>API: 表/列/类型元数据
  API->>API: 生成 DDL 文本 schemaDoc
  API->>DB: UPDATE DataSource.schemaDoc
  API-->>Admin: tableCount: 42, syncedAt
```

### 7.4 会话持久化流程

```mermaid
sequenceDiagram
  participant User as 用户
  participant Web as NextJS
  participant API as NestJS
  participant Agent as LangGraph
  participant DB as PostgreSQL

  User->>Web: 发送消息
  Web->>API: POST /api/chat/stream
  API->>DB: INSERT Message(role=USER)

  loop 每个 Agent 节点执行
    Agent->>Agent: 节点处理
    Agent->>DB: UPSERT AgentCheckpoint(state JSONB)
    Note over DB: threadId = sessionId
  end

  Agent-->>API: 工作流完成
  API->>DB: INSERT Message(role=ASSISTANT, content, chartConfig, sqlQuery)
  API-->>Web: SSE done

  Note over User,DB: 用户刷新页面
  User->>Web: 刷新 /chat/sessionId
  Web->>API: GET /api/sessions/:id/messages
  API->>DB: SELECT Messages ORDER BY createdAt
  API-->>Web: 完整对话历史
  Web-->>User: 恢复对话界面

  Note over User,DB: 若 Agent 仍在执行中刷新
  Web->>API: POST /api/chat/stream (重连)
  API->>DB: SELECT AgentCheckpoint WHERE sessionId
  API->>Agent: 从 checkpoint 恢复 threadId
  Agent-->>API: 从断点继续执行
```

---

## 第 8 章：安全与运维

### 8.1 认证与鉴权

| 策略 | 实现 |
|------|------|
| 认证方式 | JWT 双 Token（access + refresh） |
| access Token 有效期 | 15 分钟 |
| refresh Token 有效期 | 7 天 |
| 密码存储 | bcrypt, cost=12 |
| 角色控制 | `USER` 查数 / `ADMIN` 管理数据源 |
| 守卫 | `@UseGuards(JwtAuthGuard)` 全局；`@Roles('ADMIN')` 数据源管理 |
| Token 刷新 | refresh Token 一次性使用，刷新后颁发新对 |

```typescript
// JWT Payload
interface UserPayload {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
}
```

### 8.2 安全防护措施

| 层面 | 措施 |
|------|------|
| HTTP 安全 | Helmet 中间件（CSP、X-Frame-Options 等） |
| CORS | 白名单 `CORS_ORIGINS` 环境变量 |
| 限流 | `@Throttle(10, 60)` 对话接口 per user |
| SQL 注入 | 沙盒静态校验 + 只读账号 + 禁止多语句 |
| 数据加密 | DataSource 密码 AES-256-GCM |
| 容器隔离 | NetworkMode: none, 128MB 内存, 0.5 CPU |
| 日志脱敏 | 密码、Token 不出现在日志中 |

### 8.3 日志与监控

```typescript
// 使用 Pino 结构化日志
{
  "level": "info",
  "time": 1720861200000,
  "traceId": "abc-123",
  "sessionId": "session-uuid",
  "agentStep": "sqlExecutor",
  "duration_ms": 1250,
  "msg": "SQL executed successfully",
  "rowCount": 6
}
```

- 每个 SSE 请求生成 `traceId`，贯穿 Agent 全流程
- Agent 每个节点记录 `duration_ms`
- 错误日志包含 `sql_error` 但不包含数据库密码

### 8.4 环境变量清单

```env
# .env.example

# ===== 数据库 =====
DATABASE_URL=postgresql://postgres:password@localhost:5432/ai_bi

# ===== 认证 =====
JWT_ACCESS_SECRET=your-access-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# ===== 加密 =====
ENCRYPTION_KEY=64-char-hex-string-for-aes-256-gcm-encryption-key-here

# ===== LLM =====
LLM_API_KEY=sk-xxx
LLM_API_BASE=https://api.openai.com/v1
LLM_MODEL=gpt-4o

# ===== 服务 =====
API_PORT=4000
WEB_PORT=3000
CORS_ORIGINS=http://localhost:3000

# ===== Docker 沙盒 =====
DOCKER_HOST=unix:///var/run/docker.sock
SANDBOX_IMAGE=ai-bi-sandbox:latest
SANDBOX_TIMEOUT_MS=10000
SANDBOX_MEMORY_MB=128
```

### 8.5 Docker Compose 部署

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ai_bi
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - '4000:4000'
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/ai_bi
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      LLM_API_KEY: ${LLM_API_KEY}
      LLM_API_BASE: ${LLM_API_BASE}
      LLM_MODEL: ${LLM_MODEL}
      DOCKER_HOST: unix:///var/run/docker.sock
      CORS_ORIGINS: http://localhost:3000
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - '3000:3000'
    environment:
      NEXT_PUBLIC_API_URL: http://api:4000
    depends_on:
      - api

  # 沙盒镜像构建（不作为常驻服务，由 api 动态拉起容器）
  sandbox:
    build:
      context: ./sandbox
      dockerfile: Dockerfile
    image: ai-bi-sandbox:latest
    profiles:
      - build-only

volumes:
  pgdata:
```

**启动命令：**

```bash
# 构建沙盒镜像
docker compose --profile build-only build sandbox

# 启动服务
docker compose up -d postgres api web

# 数据库迁移
pnpm --filter @ai-bi/db prisma migrate deploy
```

### 8.6 健康检查与启动顺序

```
1. PostgreSQL 健康检查通过
2. NestJS 启动 → Prisma 连接 → Checkpointer setup → Docker 可用性检查
3. Next.js 启动 → 代理 API 请求
4. GET /api/health 返回所有服务状态
```

### 8.7 开发环境快速启动

```bash
# 安装依赖
pnpm install

# 启动 PostgreSQL
docker compose up -d postgres

# 数据库迁移
pnpm --filter @ai-bi/db prisma migrate dev

# 构建沙盒镜像
docker build -t ai-bi-sandbox:latest ./sandbox

# 启动后端（watch 模式）
pnpm --filter @ai-bi/api dev

# 启动前端（watch 模式）
pnpm --filter @ai-bi/web dev
```

---

## 附录 A：文档版本关系

| 文件 | 定位 | 关系 |
|------|------|------|
| [prd.md](./prd.md) | 产品需求文档 | 本文档的需求来源 |
| [technology-design.md](./technology-design.md) | 初版架构草案 | 本文档的前身，保留不修改 |
| technical-design-v2.md | 完整可落地技术设计 | 本文档 |

## 附录 B：开发优先级建议

| 阶段 | 模块 | 预估工期 |
|------|------|----------|
| P0 - 基础骨架 | Monorepo 初始化、Prisma Schema、Auth、健康检查 | 3 天 |
| P1 - 核心对话 | LangGraph 五 Agent、SSE 流式、ChatArea 前端 | 5 天 |
| P2 - 安全执行 | Docker 沙盒、SQL 校验、数据源管理 | 4 天 |
| P3 - 体验增强 | Dashboard 收藏、图表导出、会话侧栏 | 3 天 |
| P4 - 生产就绪 | 日志监控、Docker Compose 部署、限流 | 2 天 |

## 附录 C：关键技术决策记录

| 决策 | 选择 | 备选方案 | 理由 |
|------|------|----------|------|
| 流式协议 | SSE | WebSocket | 单向推送足够；HTTP 兼容性好；NestJS 原生支持 |
| 图表渲染 | ECharts | Recharts | 后端 JSON 直接驱动；导出 PNG 成熟 |
| SQL 执行 | Docker 沙盒 | 直连只读从库 | 进程级隔离；资源限制；不依赖 DBA 配置从库 |
| 状态持久化 | LangGraph Checkpointer + Message 双写 | 仅 Message 表 | 支持 Agent 执行中断恢复 |
| 密码存储 | AES-256-GCM 可逆加密 | Hash 不可逆 | 数据源密码需解密后连接目标 DB |
| Monorepo | Turborepo + pnpm | Nx / Lerna | 轻量；与 Next.js/NestJS 生态契合 |
