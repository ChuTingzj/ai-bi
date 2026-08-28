import type { QueryIntent, QueryResult } from './agent-types';
import type { SchemaTableMeta } from './guidance-types';

export type AgentStep =
  | 'planning'
  | 'fetching_schema'
  | 'generating_sql'
  | 'executing_sql'
  | 'generating_chart'
  | 'analyzing'
  | 'done';

export type SqlStatus = 'generated' | 'executing' | 'success' | 'error';

export type SseEvent =
  | { type: 'token'; content: string }
  | { type: 'chart'; config: Record<string, unknown> }
  | { type: 'sql'; query: string; status: SqlStatus }
  | { type: 'result'; data: QueryResult }
  | { type: 'intent'; intent: QueryIntent }
  | {
      type: 'guidance';
      originalQuestion: string;
      tables: SchemaTableMeta[];
    }
  | { type: 'status'; step: AgentStep; message: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'title'; title: string }
  | { type: 'done'; messageId: string };
