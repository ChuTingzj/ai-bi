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
