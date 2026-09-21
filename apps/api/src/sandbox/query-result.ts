import type { QueryResult } from '@ai-bi/shared';
import type { QueryResultData } from './ffp-client';

/**
 * JOIN duplicate names must not silently overwrite: first keeps `col`,
 * later copies become `col__2`, `col__3`, …
 */
export function disambiguateColumns(columns: string[]): string[] {
  const seen = new Map<string, number>();
  return columns.map((col) => {
    const n = (seen.get(col) ?? 0) + 1;
    seen.set(col, n);
    return n === 1 ? col : `${col}__${n}`;
  });
}

export function toQueryResult(data: QueryResultData): QueryResult {
  const columns = disambiguateColumns(data.columns);
  const rows = data.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
  return {
    columns,
    rows,
    // When truncated, this is the returned page size, not the full set.
    rowCount: rows.length,
    truncated: data.truncated,
  };
}
