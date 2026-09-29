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

Runner 驱动真实编译后的图，覆盖 planner、intent JSON、DDL 切片和 retry。题目集是 gold-20，prompt 用当前产品提示。钉死 `SQL_GUIDANCE_ENABLED=true`，钉死 model 和 temperature，并记录实际 provider 参数（provider 可能忽略 seed），同时记录 model version 字符串和每次运行的时间戳。首次尝试的捕获只在 runner 里包一层 `sandbox.execute`，不给产品加埋点。只跑 off 臂，3 次；每一次都报告 per-run totals。决策用的 totals 只算 15 个 decision id；held-out 的 per-run totals 只留给分类和后面的否决。

Runner PR 把 rubric 和阈值放在单独的、更早的一次提交里。任何一次运行之前，把该提交的 sha 写回本文：`rubric_commit` = （运行前填写）。

计数（a）和（b）都只覆盖这 15 个 decision id，held-out 的 5 个不计入，尽管 Stage 0 会跑完全部 gold-20。（a）在 3 次里至少 2 次、首次尝试就出现 `undefined-ref` 的不同 id 数，只作背景，不用于任何决策。（b）在 3 次里至少 2 次、重试后仍未恢复的 `undefined-ref` 的不同 id 数。`undefined-ref` 的客观判定是：首次尝试的错误里出现 Postgres 错误码 `42P01` 或 `42703`。每一次失败都按 rubric 分类，并且对实验臂盲：`undefined-ref`、`wrong join key`、`PK-related`、nullability、view 与 table 混淆、被截断的切片、`agg/filter`、`gold-ambiguous`、`noise`。其中 renderer-delta 类是 `PK-related`、nullability、view 与 table 混淆、被截断的切片。Stage 0 只有 off，盲分类规则仍照写，供 Stage 1 复用。

同时报告：bench 的 FK / PK 覆盖；bench DDL 大小相对 8000 字符切片；已连接 datasource 的 FK / PK 覆盖，只报计数。

5 个 held-out id（`BI-L1-005`、`BI-L1-007`、`BI-L1-010`、`BI-L1-012`、`BI-L2-001`）要分类。分类的人（或 agent）不是设计 renderer 的人。给设计者看的密封输出只有一个数：失败的 held-out id 个数，没有分类别的计数。

谁来跑仍是 TBD。Runner 需要 bench DB、LLM key 和一台活的 Postgres。若云端 agent 没有这些，请先取得用户的明确同意，再在用户的 Mac 上跑。本文不把 Mac 当成已经同意的安排。

## Stage 1：只在 runner 里做的 renderer 实验（无 Prisma，无 migration）

Stage 1 使用 Stage 0 的产品路径 runner：编译后的图接受注入的 schema 文本。不在 #8 的 guidance-ab harness 里跑。下一节的数字门槛必须在第一次 Stage 1 运行之前提交；本文就是这份预注册，改门槛必须先有新的提交。

**入口。** 一个 decision id 计入，当它在 3 次里至少 2 次失败，且 rubric 把该失败标成 renderer-delta 类（`PK-related`、nullability、view 与 table 混淆、被截断的切片）。仅当这样的不同 id 至少有 3 个（15 个 decision id，不含 held-out）才进入。否则记下 `renderer has no addressable failures on this bench` 并停止，等真实目标上的普查。若 bench 上 FK 为空，join / FK 记为 `untested on this bench, deferred to a real-target census`，不记为零价值。

**接缝。** 接缝单独一个 PR，单独评审。在拿出证据之前，它是唯一允许的产品代码改动。planner 和 `sqlGeneratorNode` 接受注入的 schema 文本，两处施加方式相同。优先依赖注入或可选参数。环境变量接缝本身就是一个 flag，必须默认 OFF。不用接缝时它必须是惰性的。Golden test：接缝不用时，prompt 与今天逐字节相同。8000 字符预算按表边界切在 renderer 的输出上。

**兼容。** renderer 的输出必须通过与 planner 相同的行过滤（`CREATE TABLE` 或 `^--` 行）以及相同的 `schemaFetcherNode` 块解析，并在 bench schema 上验证。若过不了，就改用同一套替换用的过滤器和切片器，并且对两臂注入的文本做完全相同的施加。`--` hints 和 enum comments 保留，形状与 `schemaDoc` 相同，因此丢掉它们不能成为混淆因素。

## 预注册决策表（Stage 1 门槛）

全部 totals、lift 和 floor 只在 15 个 decision id 上计算，尽管 Stage 0 会跑完全部 20 题。Held-out 的 5 个只提供分类和否决。每臂 3 次。Lift 是 on 的 per-run totals 的中位数减去 off 的 per-run totals 的中位数。Noise floor 是 off 各次 per-run totals 的极差。门槛是 `max(3, floor + 2)`。回归规则按 decision id 计：最多 1 个 id 在 off 里至少 2/3 次通过、在 on 里至少 2/3 次失败。

**复用 Stage 0 的 3 次 off。** 复用条件成立时，这 3 次同时提供 floor，以及 lift 里的 off 中位数（否决用的 held-out off 中位数也来自这同 3 次）。条件是：Stage 1 的 off prompt 与 Stage 0 逐字节相同；model、temperature 和已记录的 provider 参数相同；并且记录了 model version 字符串和运行时间戳。若 Stage 0 与 Stage 1 之间 model version 或任一 provider 参数变了，复用作废，必须在任何 on 运行之前另记 3 次 off。3 个样本是粗估计。on 之前先记下 floor，但这个数是暂定的。

噪声分类沿用已合并的 #8 guidance-ab harness，代码在 `benchmark/guidance-ab/kill-line.ts`。正则是 `LLM_TRANSPORT_NOISE = /^llm:\s*.*(?:operation was aborted|fetch failed)/i`。该文件的 `exclusionFor` 是 both-arm-only：两臂的 error 都匹配，该题才离开 N；只有一臂匹配则记为失败并留在 N。Postgres 的 `current transaction is aborted` 不匹配这条正则。

本设计在 Stage 1 把这条正则用到两臂，用来识别基础设施、非 SQL 的 `noise`。排除规则与 #8 不同：某个 decision id 只要在任一臂的任一次运行里出现这类失败，就从这 15 个里排除，并在报告里列出。floor 用同一个最终 id 集合，从 Stage 0 的 off 运行重算（复用作废时，用那 3 次新的 off）。决策使用重算后的 floor 和 lift。若剩下的 decision id 少于 12，结果是 `INCONCLUSIVE`。

先做噪声排除，再重算 floor 与 lift，然后按下表。例：floor 为 2 时需要 lift +4，因为 `max(3, floor + 2) = 4`。floor 为 0 或 1 时需要 lift +3，因为 `max(3, 0 + 2) = 3`，`max(3, 1 + 2) = 3`。

| 结果 | 条件 | 之后 |
| --- | --- | --- |
| PASS | `floor < 3`，且 lift ≥ `max(3, floor + 2)`，且回归规则成立，且 held-out 否决未触发 | 可以决定是否做 Stage 2 的 migration |
| INCONCLUSIVE | `floor ≥ 3`，不论 lift（这是故意的）；或噪声排除后 decision id 少于 12 | 不 ship，不 kill，停止。再试需要一份新的预注册设计。没有更大的题集：gold-20 就是 15+5 |
| KILL | `floor < 3`，且 lift < `max(3, floor + 2)` | 不做 Stage 2 的 migration |
| REGRESSION-MIXED | `floor < 3` 且 lift 达到门槛，但回归规则被违反，或 held-out 否决触发 | 不 ship，先查 |

因为 lift 的门槛至少是 3，对 per-total 做非劣效检验是空的。回归规则按 id 计，作用在头条数字上。

Held-out 否决：on 的 held-out per-run totals 的中位数，比 off 的 held-out per-run totals 的中位数更差，且差值大于 1（中位数对中位数，与 lift 同一算法）。这 5 个 id 永不进入头条，也永不报成 20 个 id 的数字。两臂其余一切钉死相同。guidance 自己的产品提升仍未测量，因此结果只在 guidance 打开时成立。

Stage 1 是单一 model、单一 bench，没有真实目标 datasource，不是端到端的产品测量。ship 之前仍必须在真实目标上重测产品路径。它只决定要不要做 Stage 2 的 migration。

## Stage 2：持久化 / migration（仅当 Stage 1 为 PASS）

派生 snapshot 与手写的 manual relations 分开：自己的表；仅 owner / admin；记下 who 和 when；遥测里永不计为 backed。

Snapshot JSON：键带 schema 限定。v1 只接受单一 schema `public`，其他 schema 显式拒绝。表和视图都收录，并带 `kind`。列含 `name`、`dataType`、`nullable`、PK。关系是有序的列对，并有稳定的 relation id。

Hash 不含 `syncedAt`。规范序：表按 qualified name，列按 ordinal，关系按 canonical key（两端的 qualified name 加上有序的列清单）。version 只在 hash 变化时递增。

FK / PK 经 `pg_catalog` 读取，不经 `information_schema`。最小权限角色会静默得到空的 FK。Sync guard：新关系数为 0 而旧关系数大于 0 时，拒绝覆盖并把这件事显式报出来。Snapshot 保存自己的 sync stamp。每次 sync 都刷新这个 stamp，即使 hash 和 version 没有变化。stamp 等于该 datasource 的 `lastSyncAt` 算新鲜；只有 stamp 严格早于 `lastSyncAt` 时才回退到 `schemaDoc`。

Golden test：flag 关闭时 `schemaDoc` 与今天逐字节相同。snapshot 写入失败不得打断 sync。该 PR 写明 migration 如何撤销。Stage 1 的 live-DB renderer 与 Stage 2 的 snapshot renderer 之间做字节一致性测试。

过期 snapshot 的警告要出现在 datasource owner 面前（sync 响应和 datasource 页面），并打一行日志。

Stage 2 的 PR1 只和 reader 一起交付。manual-relation API 单独成 PR，而且必须有具名调用方。视图以 `kind = view` 纳入。类型不是 `POSTGRESQL` 时（含 MySQL），flag 为空操作。

## 开放问题

1. 谁跑 Stage 0 的 runner：云端 agent，还是用户的 Mac。在用户的 Mac 上跑需要用户明确同意，不能默认。
2. 真实目标是否声明了 FK。只做计数普查。
3. 要不要做问题导出。不属于本设计；普查可以直接读 `Message`。
