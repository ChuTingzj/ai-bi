# Schema Truth 设计（分阶段、预注册）

**Status = DESIGN**

基线 `fa3cbe7`。本文只定阶段、入口和数字门槛，不改代码、配置、migration、模板或 benchmark。

**任何未来 flag 默认 OFF。** 未显式打开时，产品路径必须与今天相同。这与 `SQL_GUIDANCE_ENABLED` 相反：后者是默认 ON 的 kill switch（未设置、空、`true`、`1` 为开；`false`、`0`、`off` 为关）。

## 不能当作本项目证据的数字

2026-09-24 的 schema-dump A/B（gold-20，结果 +3/20，kill line +4/20）只测了裸 `INFORMATION_SCHEMA` 的表名、列名和类型文本。它对 FK / join 的价值没有结论。

Lab 的 6/7 对 2/7，以及 harness 的 CLEAR 数字，都不是本项目的证据。

## 现状（已在 `fa3cbe7` 核对）

**Extract。** 手动 `POST /api/datasources/:id/sync-schema`。Postgres 与 MySQL 都经 `buildDdl` 拼成一条 DDL 字符串，与 `lastSyncAt` 在同一次 `dataSource.update` 里写入。FK 已抽取：Postgres 用 `pg_constraint` 且 `contype = 'f'`（含复合键），MySQL 用 `KEY_COLUMN_USAGE`；渲染为 `CONSTRAINT ... FOREIGN KEY`，再由 `schema-parse.ts` 解析进 `outgoingRelations`。PK 不抽取、不存储。没有 version，也没有 content hash。没有 `BASE TABLE` 过滤，因此视图会被写进 DDL。

**Prompt。** planner 只看见匹配 `CREATE TABLE` 或 `^--` 的行（`nodes.ts`）。`schemaFetcherNode` 保留提到相关表的 `CREATE TABLE` 块，再切到 8000 字符。`sqlGeneratorNode` 把结果填进 `{table_schema}`。

**Sandbox。** `SandboxService.execute` 做只读检查、host denylist、`ffp-sql-sandbox` 的 `validateSql`（写操作、关键字、多语句），然后 Docker `executeSql`。没有 unknown-table / unknown-column 检查，也没有 join 检查。

**Retry。** `sqlExecutorNode` 把 `sql_error` 设为 `result.error`。`mapSandboxError` 对 `EXECUTION_FAILED` 保留 `沙盒执行失败：<raw error>`，对未映射的 code 保留原文。`sqlGeneratorNode` 把 `上一次生成的 SQL` 和 `上一次执行错误：${sql_error}` 追加进下一轮 prompt。`error_count < 3` 时重试。未核实：`ffp-sql-sandbox` 对未定义的表或列返回哪个 code。Stage 0 必须原样抓下一条。

**Bench。** `benchmark/scripts/setup.ts` 调用 `buildDdl` 时不传 FK 参数，bench DB 可能没有 FK。未核实。Stage 0 报告这一点。

**Messages。** 用户问题存在 `Message`（`role = USER`），没有导出端点。Wizard 摘要里有 `原问题：`。

## 已删除的决策

生成后的 unknown-name gate，以及它的 EXPLAIN 变体，从计划中删除。原始数据库错误已经进入重试 prompt。

只在 Stage 0 出现下面两种情况之一时重开，而且重开是重新评估，不是动手做：错误文本被吞掉；或者 decision-set 里至少 3 个 id 在重试后仍有未恢复的 undefined-ref。JOIN-backed 检查出局：价值没有证明，也没有消费者。

## 目标与非目标

目标：先弄清结构文本在产品路径上是不是真实失败来源；只有那时才考虑 renderer 和 snapshot。

非目标：改 `intent-aggregation-grain-v1.md`；做 MySQL；新建 package 或 repo；重做 wizard；静默改写 JOIN；每次对话自动 sync；为了帮这个功能而往 bench 里种 FK。

## Stage 0：普查

需要一个小型、只在测试时使用的 runner PR，与本文档 PR 分开。

Runner 驱动真实编译后的图，覆盖 planner、intent JSON、DDL 切片和 retry。题目集是 gold-20，prompt 用当前产品提示。钉死 `SQL_GUIDANCE_ENABLED=true`，钉死 model 和 temperature，并记录实际 provider 参数（provider 可能忽略 seed）。首次尝试的捕获只在 runner 里包一层 `sandbox.execute`，不给产品加埋点。只跑 off 臂，3 次；每一次都报告 per-run totals。Rubric 和阈值在任何一次运行之前提交。

计数两项：（a）在 3 次里至少 2 次、首次尝试就出现 undefined-ref 的不同 question id 数；（b）在 3 次里至少 2 次、重试后仍未恢复的 undefined-ref 的不同 id 数。每一次失败都按 rubric 分类，并且对实验臂盲：`undefined-ref`、`wrong join key`、`PK-related`、`agg/filter`、`gold-ambiguous`、`noise`。Stage 0 只有 off，盲分类规则仍照写，供 Stage 1 复用。

同时报告：bench 的 FK / PK 覆盖；bench DDL 大小相对 8000 字符切片；已连接 datasource 的 FK / PK 覆盖，只报计数。

5 个 held-out id（`BI-L1-005`、`BI-L1-007`、`BI-L1-010`、`BI-L1-012`、`BI-L2-001`）要分类，但分类对设计 renderer 的人密封，对方只看计数，直到 Stage 1 结束。

谁来跑：TBD。Runner 需要 bench DB、LLM key 和一台活的 Postgres。云端 agent 没有这些时，由用户的 Mac 跑。

## Stage 1：只在 harness 里做的 renderer 实验

无 Prisma，无 migration。下一节的数字门槛必须在第一次 Stage 1 运行之前提交；本文就是这份预注册，改门槛必须先有新的提交。

**入口。** 仅当 Stage 0 显示至少 3 个不同的 decision-set id（15 个，不含 held-out），其失败可以合理地归因于 renderer 能改变的字段：`PK-related`、nullability、view 与 table 混淆、被截断的切片。否则记下 `renderer has no addressable failures on this bench` 并停止，等真实目标上的普查。若 bench 上 FK 为空，join / FK 记为 `untested on this bench, deferred to a real-target census`，不记为零价值。

**接缝。** planner 和 `sqlGeneratorNode` 必须接受注入的 schema 文本。用依赖注入、可选参数，还是环境变量，仍是开放选择。施加方式对 planner 和 SQL 节点相同。8000 字符预算按表边界切在 renderer 的输出上。必需的 golden test：接缝不用时，prompt 与今天逐字节相同。

列出 renderer 相对 `schemaDoc` 的差异，格式之外的都要列，包括 `--` hints 和 enum comments 是否保留。缺 hint 是混淆因素，臂开跑之前先修。

## 预注册决策表（Stage 1 门槛）

Decision set 是 15 个 id，每臂 3 次。Lift 是 on 的 per-run totals 的中位数减去 off 的 per-run totals 的中位数。Noise floor 是 off 各次 per-run totals 的极差。

**复用 Stage 0 的 3 次 off** 来算 floor，不另跑 3 次。前提是 Stage 1 的 off prompt 与 Stage 0 逐字节相同，且 model、temperature 和已记录的 provider 参数相同。不满足则这 3 次作废，必须先另跑 3 次 off、记下 floor，然后才允许任何 on。3 个样本是粗估计。floor 在任何 on 运行之前记录。

例：floor 为 2、lift 为 +3 时通过，因为 `max(3, floor + 1) = 3`。

| 结果 | 条件 | 之后 |
| --- | --- | --- |
| PASS | lift ≥ `max(3, floor + 1)`，且回归规则成立：最多 1 个 id 在 off 里至少 2/3 次通过、在 on 里至少 2/3 次失败 | 可以决定是否做 migration |
| INCONCLUSIVE | floor ≥ 3 | 不 ship，不 kill。最多允许一次更大集合的重跑，然后停止 |
| KILL | floor < 3，且 lift < `max(3, floor + 1)` | 不做 migration |
| REGRESSION-MIXED | lift 达到门槛，但回归规则被违反 | 不 ship，先查 |

因为已经要求 lift ≥ 3，对 per-total 做非劣效检验是空的。上面的回归规则按 id 计，会作用在头条数字上。

Held-out 的 5 个 id 只作否决：on 的 per-run total 不得比 off 差超过 1。它们永不进入头条，也永不报成 20 个 id 的数字。两臂其余一切钉死相同。guidance 自己的产品提升仍未测量，因此结果只在 guidance 打开时成立。

Stage 1 只是 harness 证据。它决定要不要建 migration，不是产品端到端证据。任何 ship 之前，必须在产品路径上重测。

## Stage 3（仅当 Stage 1 为 PASS）

本设计没有 Stage 2。Stage 3 是 migration，而且只有 Stage 1 为 PASS 才进入。

派生 snapshot 与手写的 manual relations 分开：自己的表；仅 owner / admin；记下 who 和 when；遥测里永不计为 backed。

Snapshot JSON：键带 schema 限定。v1 只接受单一 schema `public`，其他 schema 显式拒绝。表和视图都收录，并带 `kind`。列含 `name`、`dataType`、`nullable`、PK。关系是有序的列对，并有稳定的 relation id。

Hash 不含 `syncedAt`。规范序：表按 qualified name，列按 ordinal，关系按 canonical key（两端的 qualified name 加上有序的列清单）。version 只在 hash 变化时递增。

FK / PK 经 `pg_catalog` 读取，不经 `information_schema`。最小权限角色会静默得到空的 FK。Sync guard：新关系数为 0 而旧关系数大于 0 时，拒绝覆盖并把这件事显式报出来。Snapshot 保存自己的 sync stamp；stamp 旧于该 datasource 的 `lastSyncAt` 时，回退到 `schemaDoc`。

Golden test：flag 关闭时 `schemaDoc` 与今天逐字节相同。snapshot 写入失败不得打断 sync。该 PR 写明 migration 如何撤销。Stage 1 的 live-DB renderer 与 Stage 3 的 snapshot renderer 之间做字节一致性测试。

过期 snapshot 的警告要出现在 datasource owner 面前（sync 响应和 datasource 页面），并打一行日志。

Stage 3 的 PR1 只和 reader 一起交付。manual-relation API 单独成 PR，而且必须有具名调用方。视图以 `kind = view` 纳入。类型不是 `POSTGRESQL` 时（含 MySQL），flag 为空操作。

## 开放问题

1. 谁跑 Stage 0 的 runner：云端 agent，还是用户的 Mac。
2. 注入 schema 文本的接缝用依赖注入、可选参数，还是环境变量。
3. 真实目标是否声明了 FK。只做计数普查。
4. 要不要做问题导出。不属于本设计；普查可以直接读 `Message`。
