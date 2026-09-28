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
- Execution is a direct Postgres read-only session on the benchmark database (`BENCHMARK_DB_*`), same as schema-ab. `validateSql` from `ffp-sql-sandbox` classifies write rejects before the query. Scoring uses `scoreSql`. This experiment does not require the Docker sandbox execute path. The report records the `ffp-sql-sandbox` package version for provenance.
- Nothing here turns guidance on for product traffic. The production SQL prompt is unchanged. The harness does not wire the planner.

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

LLM noise from that run. These ids are not an automatic exclusion list, and they are not product failures. An item leaves N only when **both** arms still show harness transport errors (`llm: This operation was aborted`, `llm: fetch failed`). One noisy arm scores as a fail and the item stays in N.

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
| `BI-L2-007` | gold `generate_series` zero-fill vs template rule 2 |

Target agg / filter / grain set (7): `BI-L1-001`, `BI-L1-002`, `BI-L1-003`, `BI-L1-004`, `BI-L1-008`, `BI-L1-009`, `BI-L2-008`.

`BI-L2-007` left this set because its gold SQL zero-fills with `generate_series`, and frozen template rule 2 forbids inventing calendar zero-fill unless the question asks. The secondary 7 is the rest of the schema-dump arm’s “exec@1 true but value_match false” residual from the 09-24 triage, classified as aggregation / filter / grain errors (not missing FK/types).

## Kill line

Let **N** be the clean question count after dropping the gold-ambiguous ids and any item whose **both** arms have unrecovered LLM transport noise. A single-arm abort or fetch failure scores as a fail and stays in N, so it cannot erase a schema-dump pass. N is computed. The rule does not use a fixed 20-item denominator.

- **Primary:** guidance − schema-dump on exec@1 ∧ value_match ≥ **+3/N**
- **Secondary:** on the target 7, guidance − schema-dump ≥ **+3/7**

Primary +3/N is intentionally softer than schema-ab’s +4/20. A kill-line pass still does not authorize shipping guidance to the planner. There is no out-of-distribution proof.

Either miss, on a full gold-20 run, is a **kill**. A dry run or a subset is **incomplete**. Both-arm LLM transport noise is excluded from N and is not a product kill. If that id is one of the target 7, the run is **incomplete**, because the secondary bar is +3/7 and that id was not scored; re-run until stable before reading kill. Postgres `current transaction is aborted` is an execution failure. It does not match LLM transport noise and does not drop the item.

`kill_line.met` is true only when both thresholds clear. Arm totals in the report count every item, including exclusions. The kill delta does not. The denominator is clean N, never a fixed /20.

## Live model

Prefer the same model as the 2026-09-24 schema-ab triage. That run recorded `LLM_MODEL=deepseek/deepseek-v4-pro`.

If a different model is used, results are **not** cross-comparable to the 09-24 schema-ab run. Only the within-run A vs B delta is valid for the kill line.

## Risks

| Risk | Reading |
| --- | --- |
| Template may overfit the target-7 set | The kill line still uses clean N and the secondary 7. A pass does not prove generality beyond gold-20, and it does not authorize shipping guidance to the planner. |
| Single-arm LLM abort/fetch | That arm scores fail. The item stays in N, so a schema-dump pass still cuts the guidance delta. |
| Both-arm LLM abort/fetch | The item is excluded from N. That is not a product kill. If the id is in the target 7, the run is **incomplete**; re-run until stable before reading kill. |
| Postgres `current transaction is aborted` | Execution failure. It is not LLM transport noise and does not exclude the item. |
| Where SQL runs | The bench executes against direct Postgres (`BENCHMARK_DB_*`), same as schema-ab. The report records the `ffp-sql-sandbox` package version for provenance. Scoring does not require the Docker sandbox execute path. `validateSql` and `scoreSql` are the existing harness. |

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

# full gold-20. Prefer the 09-24 triage model.
export LLM_MODEL=deepseek/deepseek-v4-pro
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
| `LLM_MODEL` | yes | Prefer `deepseek/deepseek-v4-pro`. See Live model. |
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
