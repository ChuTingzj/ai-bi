# Guidance A/B

Experiment-only harness. **Not Lab.** It does not call the LangGraph / Lab path, and it is not `pnpm benchmark:run`.

Schema-dump A/B already ran. The 2026-09-24 live report is `benchmark/reports/schema-ab/2026-09-24T07-33-34-319Z` (`deepseek/deepseek-v4-pro`, git `999ed108199affddada88076160d82cf71c516a5`). Schema-dump beat no-schema by +3 on that 20-item line, short of the +4 that would have justified a schema-truth repo. This harness does not add schema-truth, a foreign-key model, or a type library.

Next comparison, same gold-20 questions, same schema dump, same scorer:

- **A `schema-dump`** — catalog text in the production SQL system prompt, same slot as the schema-ab dump arm
- **B `guidance`** — that same dump prompt, plus the frozen intent / aggregation / grain template

Each item is one SQL generation and one execution per arm. Pass means `scoreSql` has **exec@1 and sql_value_match**. `validateSql` from `ffp-sql-sandbox` only classifies write rejects. The query runs on Postgres.

The guidance text is loaded from disk at the start of every run, including `--dry-run`. The runner has no copy of those rules and there is no CLI flag to swap the file.

## Not Lab

- The user prompt is `问题：{question}` for both arms. Lab's SQL node sends planner JSON. This harness does not run the planner.
- The schema dump is `INFORMATION_SCHEMA` (table name, column name, data type).
- Execution is a direct Postgres read-only session on the benchmark database, not `ffp-sql-sandbox`.
- Nothing here turns guidance on for product traffic. The production SQL prompt is unchanged.

## Frozen template

`benchmark/guidance-ab/templates/intent-aggregation-grain-v1.md`

Version string: `guidance-intent-agg-grain-v1`. The sibling `.sha256` file must match the template bytes. The report records path, version, and sha256. Edit the template only by bumping the version and the checksum together, before a run, never during one.

The file is the B-arm addendum. In short:

1. Prefer fact tables and filters that match the question. Default `orders.status = 'completed'` for sales, GMV, and order counts unless cancelled or all statuses are explicit.
2. Aggregate at the day, week, or month the question asks for. Do not invent a calendar zero-fill unless asked.
3. Do not substitute `daily_metrics` for raw `users` / `orders` aggregations unless the question is clearly about that metrics table.
4. Average order value is `SUM(amount) / COUNT(orders)`, not spend per user.
5. Keep joins minimal and keep status filters consistent with the question intent.

## Pinned ids

From the 2026-09-24 schema-ab run. The same lists live in `benchmark/guidance-ab/pinned.ts` and are copied into each report.

LLM noise. Exclude while the abort or fetch failure is still on the item, or re-run until it is gone. These are not kill-line product failures.

| Id | 2026-09-24 failure |
| --- | --- |
| `BI-L2-002` | abort |
| `BI-L2-003` | fetch failed |
| `BI-L2-004` | fetch failed |
| `BI-L2-005` | fetch failed |
| `BI-L2-006` | fetch failed |

Gold-ambiguous. Always out of the kill denominator. Not product failures.

| Id | Why it is ambiguous |
| --- | --- |
| `BI-L1-006` | zero-fill days? |
| `BI-L1-011` | 14-day window inclusive |

Target agg / filter / grain set (8): `BI-L1-001`, `BI-L1-002`, `BI-L1-003`, `BI-L1-004`, `BI-L1-008`, `BI-L1-009`, `BI-L2-007`, `BI-L2-008`.

## Kill line

Let **N** be the clean question count on this run after removing unrecovered LLM aborts / fetch failures and the two gold-ambiguous ids. N is computed. The rule does not use a fixed 20-item denominator.

- **Primary:** guidance − schema-dump on exec@1 ∧ value_match ≥ **+3/N**
- **Secondary:** on the target 8, guidance − schema-dump ≥ **+3/8**

Either miss, on a full gold-20 run whose target 8 are free of unrecovered transport errors, is a **kill**: do not ship this guidance onto the main planner path. A dry run, a subset, or an unrecovered abort / fetch failure on a target id is **incomplete**. Re-run the noisy target items until they return SQL. Noise outside the target 8 is dropped from N and the remaining clean questions are still judged.

`kill_line.met` is true only when both thresholds clear. Arm totals in the report count every item, including exclusions. The kill delta does not.

## Setup

```bash
pnpm benchmark:db:up
pnpm benchmark:db:seed
pnpm benchmark:setup
```

`benchmark:setup` registers the datasource for the full agent benchmark. This harness reads `information_schema` and executes SQL on the benchmark database directly.

## Run

Live LLM calls are optional. CI and merge do not require one. Unit tests do not call a model.

```bash
# shape check. Loads the frozen template. No LLM quota and no database.
pnpm benchmark:guidance-ab -- --dry-run

# full gold-20, when you choose to spend a live run
export LLM_MODEL=gpt-4o
export LLM_API_KEY=sk-xxx
export LLM_API_BASE=https://api.openai.com/v1   # optional
pnpm benchmark:guidance-ab

# subset. Kill line stays incomplete.
pnpm benchmark:guidance-ab -- --id BI-L1-001 --limit 1
```

Reports land in `benchmark/reports/guidance-ab/{timestamp}/` (gitignored):

- `report.json` — per-item pass/fail, exclusions, arm totals, clean N, both kill axes, guidance version / path / sha256, `LLM_MODEL`
- `report.md` — the same figures

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
| `GUIDANCE_AB_STATEMENT_TIMEOUT_MS` | no | `15000` |
| `GUIDANCE_AB_LLM_TIMEOUT_MS` | no | `60000` |

LLM timeouts and transport failures (`aborted`, `fetch failed`) are item errors. They are not SQL `timeout_count`. `timeout_count` is Postgres `statement_timeout` (`57014`). `write_reject_count` is `NOT_READ_ONLY_PREFIX`, `FORBIDDEN_KEYWORD`, or a read-only transaction error (`25006`).

## Test

```bash
pnpm benchmark:guidance-ab:test
```

That command does not call an LLM and does not need the benchmark database.
