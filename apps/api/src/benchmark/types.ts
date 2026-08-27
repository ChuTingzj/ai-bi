import type { QueryResult } from '@ai-bi/shared';
import type { BenchmarkRunResult } from '../agent/graph/state';

export interface GoldCase {
  id: string;
  level: 'L1' | 'L2' | 'L3' | 'L4';
  question: string;
  expected_tables: string[];
  expected_chart_type?: string;
  gold_sql: string;
  result_tolerance?: {
    numeric_tolerance?: number;
  };
  analyst_keywords?: string[];
}

export interface GoldDataset {
  cases: GoldCase[];
}

export interface CaseScores {
  intent_table_recall: number;
  chart_type_match: boolean;
  /** First attempt SQL executed successfully. */
  exec_at_1: boolean;
  /** Final SQL execution succeeded. */
  exec_success: boolean;
  /** Strict gold match (column names + values) on first try. */
  sql_at_1: boolean;
  /** Exec success or strict match within 3 attempts. */
  sql_at_3: boolean;
  /** Strict column-name + value match. */
  sql_result_match: boolean;
  /** Value match ignoring column names. */
  sql_value_match: boolean;
  /** Row count equals gold. */
  sql_row_count_match: boolean;
  chart_valid: boolean;
  analyst_keyword_coverage: number;
  e2e_success: boolean;
  fallback: boolean;
}

export interface CaseResult {
  case_id: string;
  level: string;
  question: string;
  run: BenchmarkRunResult;
  gold_row_count: number | null;
  scores: CaseScores;
  failure_reason?: string;
}

export interface Thresholds {
  e2e_tsr: number;
  exec_at_1: number;
  exec_success: number;
  sql_at_1: number;
  sql_at_3: number;
  sql_value_match: number;
  intent_table_recall: number;
  chart_valid_rate: number;
  chart_type_match_rate: number;
  analyst_keyword_coverage: number;
  p95_latency_ms: number;
  avg_sql_attempts: number;
  fallback_rate: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  e2e_tsr: 0.8,
  exec_at_1: 0.85,
  exec_success: 0.9,
  sql_at_1: 0.65,
  sql_at_3: 0.85,
  sql_value_match: 0.65,
  intent_table_recall: 0.9,
  chart_valid_rate: 0.85,
  chart_type_match_rate: 0.8,
  analyst_keyword_coverage: 0.75,
  p95_latency_ms: 45_000,
  avg_sql_attempts: 1.5,
  fallback_rate: 0.15,
};

export interface AggregateMetrics {
  total: number;
  e2e_tsr: number;
  exec_at_1: number;
  exec_success: number;
  sql_at_1: number;
  sql_at_3: number;
  sql_value_match: number;
  sql_row_count_match: number;
  intent_table_recall: number;
  chart_valid_rate: number;
  chart_type_match_rate: number;
  analyst_keyword_coverage: number;
  fallback_rate: number;
  avg_sql_attempts: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  by_level: Record<
    string,
    {
      total: number;
      e2e_tsr: number;
      exec_at_1: number;
      sql_value_match: number;
    }
  >;
  failure_modes: Record<string, number>;
}

export interface BenchmarkSummary {
  model: string;
  dataset: string;
  run_at: string;
  thresholds: Thresholds;
  metrics: AggregateMetrics;
  threshold_results: Record<
    string,
    { value: number; threshold: number; pass: boolean }
  >;
  recommendation: string;
  cases: CaseResult[];
}

export interface CachedGoldResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export function normalizeQueryResult(result: QueryResult): QueryResult {
  const sortedCols = [...result.columns].sort();
  const normalizedRows = result.rows
    .map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of sortedCols) {
        out[col] = row[col];
      }
      return out;
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    columns: sortedCols,
    rows: normalizedRows,
    rowCount: normalizedRows.length,
  };
}
