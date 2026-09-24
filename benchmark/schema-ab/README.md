# Schema grounding A/B

Experiment-only harness. **Not Lab.** It does not call the LangGraph / Lab path, and it is not `pnpm benchmark:run`.

Both arms ask the same model the same questions from `benchmark/datasets/gold-20.yaml`. The only prompt difference is the schema slot in the production SQL system prompt (`SQL_SYSTEM_PROMPT`):

- **no-schema** — slot left empty
- **schema-dump** — catalog text described below

Each item is one SQL generation and one execution. Pass means the existing `scoreSql` result has **exec@1 and sql_value_match**. `validateSql` from `ffp-sql-sandbox` only classifies write rejects before the query. The query itself runs on Postgres. Statement timeout and read-only transaction errors are counted separately.

A live run with an empty schema catalog exits non-zero. Both arms would otherwise be identical.

## Not Lab

- The user prompt is `问题：{question}`. Lab's SQL node sends `查询意图：` plus planner JSON. This harness does not run the planner.
- The schema dump is `INFORMATION_SCHEMA` (table name, column name, data type). It is not `schemaDoc` DDL, and it has no sample rows.
- Execution is a direct Postgres read-only session on the benchmark database, not `ffp-sql-sandbox`.

## Kill line

Schema-dump must beat no-schema by **≥ +4/20** on exec@1 ∧ sql_value_match to justify a future schema-truth repo. That line applies to **this harness report only**. It is not a Lab gate and not a `benchmark:run` threshold. The report records the delta. This harness does not open a schema-truth repo. `kill_line.met` is meaningful only on a live run of all 20 items (`kill_line.applicable`).

## Setup

```bash
pnpm benchmark:db:up
pnpm benchmark:db:seed
pnpm benchmark:setup
```

`benchmark:setup` registers the datasource for the full agent benchmark. This harness reads `information_schema` and executes SQL on the benchmark database directly.

## Run

Record `LLM_MODEL` in the environment before the live run. The CLI prints it and copies it into the report before any item starts.

```bash
# shape check, no LLM quota and no database
pnpm benchmark:schema-ab -- --dry-run

# full gold-20
export LLM_MODEL=gpt-4o
export LLM_API_KEY=sk-xxx
export LLM_API_BASE=https://api.openai.com/v1   # optional
pnpm benchmark:schema-ab

# subset
pnpm benchmark:schema-ab -- --id BI-L1-001 --limit 1
```

Reports land in `benchmark/reports/schema-ab/{timestamp}/`:

- `report.json` — per-item pass/fail, arm totals, delta, `LLM_MODEL`, timestamps, write-reject and timeout counts
- `report.md` — the same figures plus the kill line

## Env

| Variable | Required live | Default |
| --- | --- | --- |
| `LLM_MODEL` | yes | — |
| `LLM_API_KEY` | yes | — |
| `LLM_API_BASE` | no | `https://api.openai.com/v1` |
| `BENCHMARK_DB_HOST` | no | `localhost` |
| `BENCHMARK_DB_PORT` | no | `5433` |
| `BENCHMARK_DB_USER` | no | `postgres` |
| `BENCHMARK_DB_PASSWORD` | no | `password` |
| `BENCHMARK_DB_NAME` | no | `benchmark_bi` |
| `SCHEMA_AB_STATEMENT_TIMEOUT_MS` | no | `15000` |
| `SCHEMA_AB_LLM_TIMEOUT_MS` | no | `60000` |

LLM timeouts are item errors. They are not SQL `timeout_count`. `timeout_count` is Postgres `statement_timeout` (`57014`). `write_reject_count` is `NOT_READ_ONLY_PREFIX`, `FORBIDDEN_KEYWORD`, or a read-only transaction error (`25006`).

## Test

```bash
pnpm benchmark:schema-ab:test
```
