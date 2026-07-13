这份技术设计方案（TDD）旨在为你提供深度，让你在面试被问到“请画一下这个项目的架构图”或“具体是怎么落地的”时，能够给出教科书级别的回答。

我们将以 **Next.js + NestJS + LangGraph.js + Docker** 为核心，构建一个全栈 TypeScript 的企业级架构。

---

# 🚀 DataMind AI-BI 多智能体平台技术设计方案

## 1. 整体架构设计 (Architecture Overview)

采用 **前后端分离 + AI 编排层 + 隔离沙盒** 的四层架构：

1. **展现层 (Next.js)**：负责交互、流式打字机效果呈现、动态图表渲染。
2. **业务网关层 (NestJS)**：鉴权、限流、会话管理、SSE 长连接维持。
3. **AI 编排层 (LangGraph.js 模块)**：集成在 NestJS 中，作为多智能体状态机，编排大模型调用。
4. **基础设施与沙盒层 (PostgreSQL + Docker)**：PG 负责元数据与状态持久化；Docker 提供只读的 SQL 临时执行沙盒。

---

## 2. 前端技术设计 (Next.js 展现层)

前端的核心挑战在于：**如何优雅地处理流式数据，并根据非结构化文本动态渲染结构化图表。**

### 2.1 目录结构规划与渲染策略

* **App Router (RSC + Client Components)**
* `app/page.tsx` (Server Component): 获取用户历史对话列表，直连 DB 提升首屏性能（SSR）。
* `app/chat/ChatArea.tsx` (Client Component): 维护对话流状态，处理 SSE 收发。


* **流式请求处理 (SSE)**
* 不使用普通 HTTP 请求，采用 `fetch` + `ReadableStream` 或直接使用 `EventSource`，解析后端返回的 Chunk 数据。



### 2.2 动态图表渲染引擎 (Dynamic Renderer)

* **协议设计**：与后端约定，图表配置将被包裹在特定的 Markdown 代码块中，例如：
```json
​```echarts
{ "xAxis": { "type": "category", "data": ["Mon", "Tue"] }, "series": [...] }
```

```


* **解析与渲染**：
* 使用 `remark` 和 `react-markdown` 拦截特定的代码块（AST 抽象语法树解析）。
* 遇到 `echarts` 标记时，不渲染代码块，而是将 JSON 传入一个动态组件 `<EChartsRenderer config={json} />` 进行渲染。



---

## 3. 后端技术设计 (NestJS 业务网关层)

NestJS 作为中枢，不仅要处理传统的 CRUD，还要负责管理 LangGraph 的生命周期。

### 3.1 核心模块划分

* **`AuthModule`**: 基于 JWT 的用户身份校验。
* **`ChatModule`**: 暴露 `GET /api/chat/stream` 接口，利用 NestJS 的 `Sse` 装饰器与 RxJS 返回 `Observable<MessageEvent>`。
* **`AgentModule` (核心)**: 封装 LangGraph.js，对外提供 `invokeWorkflow` 方法。
* **`SandboxModule`**: 基于 `dockerode` 库，通过 Node.js 操控 Docker 引擎。

### 3.2 数据沙盒执行引擎 (Docker Sandbox)

**这是面试中极其亮眼的安全架构设计**：

1. **背景**：AI 生成的 SQL 如果直接在主库执行，可能导致删库跑路或慢查询导致数据库宕机。
2. **流程**：
* 当 AI 生成 SQL 后，`SandboxModule` 会通过 Docker API 拉起一个轻量级的 Node/Python 容器。
* 该容器配置了严格的 **内存限制 (128M)**、**CPU 限制** 以及 **网络隔离**。
* 容器仅拥有目标数据库的**只读账号 (Read-Only)** 凭证。
* SQL 执行完毕（或达到 10 秒超时强制 Kill 容器）后，将结果 JSON 返回给 NestJS。



---

## 4. AI 编排技术设计 (LangGraph.js 层)

这是目前市面上最前沿的玩法，抛弃脆弱的单体 Prompt Chain，采用**循环状态机**。

### 4.1 状态定义 (State Definition)

定义整个 Graph 在流转过程中共享的数据结构：

​```typescript
interface BiAgentState {
  messages: BaseMessage[];   // 对话历史
  question: string;          // 当前问题
  table_schema: string;      // 目标表的 DDL
  generated_sql: string;     // AI 生成的 SQL
  sql_result: string;        // SQL 执行结果（或报错信息）
  chart_config: string;      // 生成的图表 JSON
  error_count: number;       // 纠错重试次数
}

```

### 4.2 节点与边设计 (Nodes & Edges)

* **节点 (Nodes)**:
1. `SchemaFetcherNode`: 根据问题检索需要查询哪些表，获取 DDL。
2. `SqlGeneratorNode`: 利用 LLM 生成 SQL 语句。
3. `SqlExecutorNode`: 调用 SandboxModule 执行 SQL。如果报错，将报错信息写入 `sql_result`。
4. `ChartGeneratorNode`: 根据执行成功的 JSON 数据，生成 ECharts 配置。


* **条件边 (Conditional Edges - 核心自纠错逻辑)**:
* 从 `SqlExecutorNode` 出发，进行路由判断：
* 👉 **分支 A**：如果执行成功 `->` 流转到 `ChartGeneratorNode`。
* 👉 **分支 B**：如果执行报错，且 `error_count < 3` `->` 携带报错信息重新流转回 `SqlGeneratorNode` 让 LLM 修复 SQL。
* 👉 **分支 C**：如果执行报错且次数超限 `->` 结束，向用户抛出兜底回复。



---

## 5. 数据库设计 (PostgreSQL + Prisma)

利用 Prisma Schema 保证后端类型安全，核心表结构设计如下：

```prisma
// schema.prisma

// 数据源配置表 (存储用户接入的 DB 信息)
model DataSource {
  id        String   @id @default(uuid())
  name      String
  type      String   // e.g., 'mysql', 'postgres'
  host      String
  port      Int
  username  String
  // 密码加密存储
  password  String   
  schemaDoc String?  // 提前抽取好的表结构字典 (可通过 RAG 检索)
}

// 会话表
model Session {
  id         String   @id @default(uuid())
  userId     String
  title      String
  createdAt  DateTime @default(now())
  messages   Message[]
}

// LangGraph Checkpoint 表 (用于持久化 Graph 状态)
// 利用 PG 的 JSONB 字段存储多智能体的中间态，实现“跨端刷新不丢进度”
model AgentCheckpoint {
  threadId   String   @id
  state      Json     // JSONB
  updatedAt  DateTime @updatedAt
}

```

