import type { QueryIntent, QueryResult } from '@ai-bi/shared';
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
  sql_at_1: boolean;
  sql_at_3: boolean;
  sql_result_match: boolean;
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
  sql_at_1: number;
  sql_at_3: number;
  intent_table_recall: number;
  chart_valid_rate: number;
  analyst_keyword_coverage: number;
  p95_latency_ms: number;
  fallback_rate: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  e2e_tsr: 0.8,
  sql_at_1: 0.65,
  sql_at_3: 0.85,
  intent_table_recall: 0.9,
  chart_valid_rate: 0.85,
  analyst_keyword_coverage: 0.75,
  p95_latency_ms: 45_000,
  fallback_rate: 0.15,
};

export interface AggregateMetrics {
  total: number;
  e2e_tsr: number;
  sql_at_1: number;
  sql_at_3: number;
  intent_table_recall: number;
  chart_valid_rate: number;
  analyst_keyword_coverage: number;
  fallback_rate: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  by_level: Record<string, { total: number; e2e_tsr: number }>;
  failure_modes: Record<string, number>;
}

export interface BenchmarkSummary {
  model: string;
  dataset: string;
  run_at: string;
  thresholds: Thresholds;
  metrics: AggregateMetrics;
  threshold_results: Record<string, { value: number; threshold: number; pass: boolean }>;
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
