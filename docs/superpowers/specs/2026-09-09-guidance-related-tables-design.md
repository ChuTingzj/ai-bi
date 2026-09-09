# Guidance Related-Table Queries — Design Spec

**Date:** 2026-09-09  
**Status:** Approved (pending final user review of this file)  
**Product:** DataMind AI-BI (`apps/web` guidance wizard + `apps/api` schema sync / agent)  
**Approach:** Scheme 1 — embed FKs in `schemaDoc`, Shared parse, auto INNER JOIN from direct FK neighbors

## Problem

Guidance mode (`GuidanceWizard`) is single-table only: the UI keeps one `table`, and field/filter steps only list that table’s columns. Users cannot express queries that need related tables (e.g. orders + users). `GuidancePayload.tables` is already an array, but the wizard always submits `[table]`. Schema sync (`buildDdl`) emits columns only—no `FOREIGN KEY`—and `parseSchemaDoc` currently skips constraint lines, so the product has no relation graph to drive recommendations.

## Goals

- Let users pick a **primary table**, then optionally multi-select **directly FK-related** tables.
- Auto-infer **INNER JOIN** conditions from FOREIGN KEY metadata; do not ask users to write SQL join keys when FK exists.
- Keep the wizard at **3 steps** (表 / 字段 / 过滤); related-table selection lives inside the table step.
- Qualify fields and filters as `table.column` when multiple tables are selected.
- Feed explicit `joins` into planner/SQL prompts so the model does not invent join keys.
- Reuse `schemaDoc` as the single source of truth for Lab, guidance, and the agent.

## Non-goals (v1)

- Naming heuristics (`user_id` → `users.id`) when no FK exists
- “Browse all tables” fallback or user-defined join keys
- Multi-hop path search (A→B→C without a direct FK to the primary)
- LEFT / OUTER / CROSS joins; editable join type
- Unlimited arbitrary tables outside the primary’s direct FK neighborhood

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| UX model | Primary + recommended related tables; JOIN auto-inferred |
| Related count | Unlimited among **direct FK neighbors** of the primary |
| Relation source | FOREIGN KEY only (no heuristics) |
| Wizard steps | Still 3; related UI nested in 表 step |
| Implementation | Embed FK in `schemaDoc` + Shared parse (Scheme 1) |
| Join type | `INNER` only |
| Field identity | Always qualified `table.column` on new multi-table submits |
| Primary identity | `GuidancePayload.tables[0]` |

## Data model

Extend `@ai-bi/shared` (`guidance-types` and related):

```ts
interface SchemaRelationMeta {
  name?: string;
  fromTable: string;
  fromColumns: string[]; // supports composite FKs
  toTable: string;
  toColumns: string[];
}

interface SchemaTableMeta {
  name: string;
  columns: SchemaColumnMeta[];
  /** Relations where this table is the FK side (fromTable === name) */
  outgoingRelations?: SchemaRelationMeta[];
}

interface GuidanceJoin {
  leftTable: string;
  leftColumns: string[];
  rightTable: string;
  rightColumns: string[];
  type: 'INNER';
}

interface GuidancePayload {
  tables: string[]; // [primary, ...related]
  fields: string[]; // e.g. "orders.gmv"
  filters: GuidanceFilter[]; // field qualified
  joins: GuidanceJoin[]; // [] for single-table
}
```

**Compatibility**

- Single-table: `joins: []`; behavior matches today.
- Legacy messages without `joins` or unqualified field names: readonly summary remains readable; new submits always write the full structure.
- Relation graph is treated as undirected when building **candidates**; join rows preserve FK column mapping from the constraint.

## Schema sync & parsing

### Sync (`apps/api` datasource service)

After existing column introspection for Postgres and MySQL, fetch FK metadata:

- **Postgres:** `information_schema` constraint + key usage tables, or `pg_constraint` (`contype = 'f'`).
- **MySQL:** `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` where `REFERENCED_TABLE_NAME` is not null.

Group by constraint name into composite `fromColumns` / `toColumns`.

### DDL (`buildDdl` in `@ai-bi/shared`)

Append constraint lines inside each `CREATE TABLE` body, e.g.:

```sql
CREATE TABLE orders (
  id int NOT NULL,
  user_id int,
  gmv numeric,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
);
```

### Parse (`parseSchemaDoc`)

Stop skipping `FOREIGN KEY` / `CONSTRAINT ... FOREIGN KEY` lines. Emit `SchemaRelationMeta` onto the **FK-holding** table’s `outgoingRelations`.

### Shared helpers

- `relationsForTable(tables, primary)` — tables with a **direct** FK edge to/from primary (bidirectional).
- `buildJoins(primary, related[], relations)` — produce `GuidanceJoin[]`; reject related tables with no direct edge.
- v1: **no multi-hop** pathfinding. “Unlimited multi-select” means all direct neighbors, not transitive closure.

### Migration

Existing datasources must **re-sync Schema** to populate FKs. Until then, guidance behaves as single-table (no related section).

## Guidance payload, summary, agent

### Submit contract

Wizard builds:

- `tables = [primary, ...selectedRelated]`
- `joins = buildJoins(...)`
- `fields` / `filters[].field` always `table.column`

### API DTO (`GuidancePayloadDto`)

Add nested `joins` validation (`leftTable`, `leftColumns`, `rightTable`, `rightColumns`, `type: 'INNER'`). Missing/empty `joins` = single-table (backward compatible).

**Recommended server checks (400 on failure)**

- `tables[0]` exists in schema.
- Every other table is a direct FK neighbor of the primary.
- Each join matches a parsed relation edge.

### Natural-language summary (`buildGuidanceMessage`)

Example:

`基于表 orders（关联 users, products），关联 orders.user_id=users.id AND orders.product_id=products.id，字段 orders.gmv, users.name，条件 …，原问题：…`

Omit the association clause for single-table.

### Agent

- `formatGuidanceBlock`: include JOIN lines; require SELECT/WHERE to use only listed qualified fields; require SQL to use the given INNER JOINs.
- Planner: `relevant_tables` must cover `guidance.tables`.
- SQL system prompt: when guidance includes joins, use those INNER JOINs; do not rewrite join keys.
- `schemaFetcher`: continue slicing DDL for all `relevant_tables` (blocks now include FK lines).

### Readonly summary UI

`GuidanceSummaryReadonly` shows relation chips (e.g. `orders → users`) when `joins.length > 0`.

## UI design (GuidanceWizard)

Reuse existing tokens (`bg-card`, `primary`, chips, `min-h-11`, Phosphor). Prefer Minimalism / Swiss density already in the chat bubble; progressive disclosure so single-table flows stay unchanged.

### Table step

1. Primary table: single-select list + search (unchanged).
2. After primary is selected, if direct FK neighbors exist, show **「可关联表（可选）」**:
   - Multi-select checkboxes; row shows table name + muted key hint (`via user_id → users.id`).
   - Selected related chips above the list (`flex flex-wrap gap-1.5`; long names `truncate`; dismiss with ×).
   - Helper copy: 「根据外键自动关联，可多选」.
3. No FK neighbors: **do not render** the related section (avoid noise).
4. Changing primary clears related selection, fields, and filters.
5. Next requires only a primary table; related is optional.

### Field step

- Group columns by table; label primary as 「主表」.
- Chips and checkboxes use `table.column`.
- Search filters across groups; keep scrollable `max-h`.

### Filter step

- Field `<select>` uses `<optgroup>` per table.
- Values store qualified names; if no fields selected yet, options are all columns of selected tables.
- Keep copy: 「过滤条件可选，可直接开始查询。」

### Progress & a11y

- Still 「第 x 步 / 共 3 步」.
- Related block: `fieldset` + `legend` (or equivalent `aria-label`); decorative icons `aria-hidden`.
- Expand/reveal: short `motion-safe` fade (~200ms); respect `prefers-reduced-motion`.
- Long related lists: internal `max-h` + scroll so the chat bubble does not blow out.

## Error handling

| Case | Behavior |
|------|----------|
| Schema sync failure | Existing datasource error UX; guidance unchanged for unsynced sources |
| Invalid joins / non-neighbor related on submit | API 400; short inline/toast error; do not silently rewrite |
| SQL join execution failure | Existing SQL retry / fallback; do not re-open join editing in guidance |
| Incomplete composite FK | Drop the entire edge from candidates |

## Testing

- **Shared:** `buildDdl` emits FK lines; `parseSchemaDoc` parses single- and composite-column FKs; `relationsForTable` / `buildJoins` cover bidirectional edges and reject illegal related tables.
- **API:** PG/MySQL sync fixtures include FKs; DTO validates `joins`; `formatGuidanceBlock` includes JOIN text.
- **Web:** no related UI without FK; multi-select related; primary change clears downstream; field/filter grouping + qualified names; summary and `buildGuidanceMessage` include association text.
- **Regression:** legacy payloads without `joins` still render readonly summary and single-table flows.

## Architecture sketch

```text
information_schema FKs
        │
        ▼
   buildDdl(+CONSTRAINT FK…)  →  schemaDoc
        │
        ▼
   parseSchemaDoc → SchemaTableMeta + outgoingRelations
        │
        ├─ Guidance SSE (tables meta)
        │     └─ TableStep: primary + related multi-select
        │           └─ FieldStep / FilterStep (grouped, qualified)
        │                 └─ GuidancePayload { tables, fields, filters, joins }
        │
        └─ Agent formatGuidanceBlock + schemaFetcher DDL slices
              └─ Planner / SQL (must honor joins)
```

## Implementation order (hint for plan)

1. Shared types + `buildDdl` / `parseSchemaDoc` + relation helpers + unit tests  
2. Datasource sync FK extraction (PG + MySQL)  
3. API DTO + optional join validation + agent prompt/block updates  
4. Web wizard UI (Table / Field / Filter / summary / message builder)  
5. Integration / regression checks; document “re-sync Schema” for operators  

## Open follow-ups (explicitly out of v1)

- Multi-hop join path picker  
- Heuristic relations for schemas without FKs  
- LEFT JOIN / join-type control  
- Lab SchemaBrowser visualization of the relation graph  
