# AI-BI Agent Benchmark

评测 AI-BI Agent 单模型架构（`LLM_MODEL`）在 L1/L2 业务场景下的端到端能力。

## 快速开始

```bash
# 1. 启动 benchmark 数据库
pnpm benchmark:db:up

# 2. 灌入 schema + 种子数据
pnpm benchmark:db:seed

# 3. 注册数据源并同步 schemaDoc（写入 benchmark/.env.benchmark）
pnpm benchmark:setup

# 4. 构建沙盒镜像（首次）
docker compose --profile build-only build sandbox

# 5. 运行评测（全量 20 条）
pnpm benchmark:run

# 冒烟子集
pnpm benchmark:run -- --filter L1 --limit 5

# 按 case id 运行
pnpm benchmark:run -- --id BI-L1-001
pnpm benchmark:run -- --id BI-L1-001,BI-L2-003
```

## 输出

报告生成在 `benchmark/reports/{timestamp}/`：

- `summary.json` — 机器可读指标
- `report.md` — 人类可读报告（含 Go/No-Go）
- `cases/*.json` — 每条用例详情

## 门槛（MVP）

| 指标 | 门槛 | 含义 |
|------|------|------|
| E2E-TSR | ≥ 80% | 全链路可用 |
| Exec@1 | ≥ 85% | 首次 SQL 执行成功（不论是否对齐金标准） |
| Exec Success | ≥ 90% | 最终执行成功 |
| SQL Value Match | ≥ 65% | 忽略列名后的结果数值匹配（核心正确性） |
| SQL@1 (strict) | ≥ 65% | 列名+数值严格等价（易受别名噪声影响） |
| SQL@3 | ≥ 85% | 含重试后的执行/匹配成功 |
| Intent Table Recall | ≥ 90% | 选表召回 |
| Chart Valid Rate | ≥ 85% | ECharts JSON 可渲染 |
| Chart Type Match | ≥ 80% | 图表类型与意图一致 |
| Analyst Keyword Coverage | ≥ 75% | 洞察关键词覆盖 |
| P95 Latency | ≤ 45s | 端到端延迟 |
| Avg SQL Attempts | ≤ 1.5 | 平均生成/重试次数 |
| Fallback Rate | ≤ 15% | 业务兜底比例 |

补充观察项（不进门槛）：SQL Row Count Match、P50 Latency。

## 数据集

- `datasets/gold-20.yaml` — 20 条金标准（L1: 12, L2: 8）
- `seed/` — 电商测试库 DDL 与种子数据

## Schema grounding A/B

实验脚本，不走 LangGraph / Lab。说明与命令见 [schema-ab/README.md](schema-ab/README.md)。

```bash
pnpm benchmark:schema-ab -- --dry-run
pnpm benchmark:schema-ab
```

## Guidance A/B

实验脚本，不走 LangGraph / Lab。A 臂是 schema-dump，B 臂是 schema-dump 加上冻结的意图 / 聚合 / 粒度模板。产品 `sqlGeneratorNode` 的用户消息同时包含 `问题：{state.question}` 与 `查询意图：{planner JSON}`，系统提示在 schema 槽后附加同一份模板。`SQL_GUIDANCE_ENABLED` 默认开（未设置、空、`true`、`1`）；`false`、`0`、`off` 时跳过附加，供 Lab 端到端对比或紧急关闭。本 harness 不读该变量，kill line 不变。2026-09-29 CLEAR 仍只覆盖 harness 的单独问题句，产品端到端提升尚未重测。完整拆除接线仍 revert PR #9（负责人 zhangjing）。说明与风险见 [guidance-ab/README.md](guidance-ab/README.md)。

```bash
pnpm benchmark:guidance-ab -- --dry-run
pnpm benchmark:guidance-ab:test
```
