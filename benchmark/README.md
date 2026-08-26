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
```

## 输出

报告生成在 `benchmark/reports/{timestamp}/`：

- `summary.json` — 机器可读指标
- `report.md` — 人类可读报告（含 Go/No-Go）
- `cases/*.json` — 每条用例详情

## 门槛（MVP）

| 指标 | 门槛 |
|------|------|
| E2E-TSR | ≥ 80% |
| SQL@1 | ≥ 65% |
| SQL@3 | ≥ 85% |
| Intent Table Recall | ≥ 90% |
| Chart Valid Rate | ≥ 85% |
| Analyst Keyword Coverage | ≥ 75% |
| P95 Latency | ≤ 45s |
| Fallback Rate | ≤ 15% |

## 数据集

- `datasets/gold-20.yaml` — 20 条金标准（L1: 12, L2: 8）
- `seed/` — 电商测试库 DDL 与种子数据
