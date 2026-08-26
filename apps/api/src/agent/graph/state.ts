import { Annotation } from '@langchain/langgraph';
import type { QueryIntent, QueryResult } from '@ai-bi/shared';

export const BiAgentStateAnnotation = Annotation.Root({
  question: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  intent: Annotation<QueryIntent | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  relevant_tables: Annotation<string[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  table_schema: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  generated_sql: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  sql_result: Annotation<QueryResult | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  sql_error: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  chart_config: Annotation<Record<string, unknown> | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  error_count: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),
  data_source_id: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),
  session_id: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
});

export type BiAgentState = typeof BiAgentStateAnnotation.State;

export interface BenchmarkRunResult {
  intent: QueryIntent | null;
  relevant_tables: string[];
  generated_sql: string;
  sql_result: QueryResult | null;
  sql_error: string | null;
  error_count: number;
  chart_config: Record<string, unknown> | null;
  analyst_text: string;
  fallback: boolean;
  sql_attempts: number;
  latencies_ms: Record<string, number>;
  total_latency_ms: number;
}
