import type { QueryResult } from '@ai-bi/shared';

export const ARMS = ['no-schema', 'schema-dump'] as const;

export type ArmName = (typeof ARMS)[number];

/** Locked decision rule: schema-dump must beat no-schema by this many items. */
export const KILL_LINE_DELTA = 4;

/** Kill line is defined on the full gold-20 set. */
export const KILL_LINE_DENOMINATOR = 20;

export interface SchemaColumn {
  table_name: string;
  column_name: string;
  data_type: string;
}

export interface SchemaAbCase {
  id: string;
  level: string;
  question: string;
  gold_sql: string;
  numeric_tolerance?: number;
}

export type ExecuteOutcome =
  | { kind: 'ok'; result: QueryResult }
  | { kind: 'write_reject'; error: string }
  | { kind: 'timeout'; error: string }
  | { kind: 'error'; error: string };

export interface ArmItemResult {
  pass: boolean;
  exec_at_1: boolean;
  sql_value_match: boolean;
  outcome: ExecuteOutcome['kind'];
  write_reject: boolean;
  timeout: boolean;
  generated_sql: string;
  error: string | null;
}

export interface SchemaAbItem {
  id: string;
  level: string;
  question: string;
  arms: Record<ArmName, ArmItemResult>;
}

export interface ArmTotals {
  pass: number;
  total: number;
  write_reject_count: number;
  timeout_count: number;
}

export interface SchemaAbReport {
  experiment: 'schema-grounding-ab';
  dry_run: boolean;
  llm_model: string;
  dataset: string;
  git_sha: string;
  ffp_sql_sandbox: string;
  metric: 'exec_at_1 AND sql_value_match';
  scorer: 'apps/api/src/benchmark/scorers/sql.scorer.ts#scoreSql';
  started_at: string;
  finished_at: string;
  schema_dump: string;
  prompts: Record<ArmName, string>;
  kill_line: {
    rule: string;
    required_delta: number;
    denominator: number;
    observed_delta: number;
    applicable: boolean;
    met: boolean;
  };
  arms: Record<ArmName, ArmTotals>;
  delta: number;
  items: SchemaAbItem[];
}
