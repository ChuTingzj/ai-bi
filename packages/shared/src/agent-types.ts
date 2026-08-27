export type ChartType = 'line' | 'bar' | 'pie' | 'table';

export interface QueryIntent {
  summary: string;
  metrics: string[];
  dimensions: string[];
  filters: string[];
  timeRange?: string;
  chartType?: ChartType;
  relevant_tables?: string[];
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated?: boolean;
}

export interface SandboxResult {
  success: boolean;
  data?: QueryResult;
  error?: string;
}
