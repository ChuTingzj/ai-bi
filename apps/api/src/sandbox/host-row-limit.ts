import type { QueryResult } from '@ai-bi/shared';

/** Host-side page size; ffp already caps via maxRows/maxBytes. */
export const RESULT_ROW_LIMIT = 1000;

export function applyHostRowLimit(
  result: QueryResult,
  limit: number = RESULT_ROW_LIMIT,
): {
  result: QueryResult;
  ffpTruncated: boolean;
  hostDidSlice: boolean;
} {
  const ffpTruncated = Boolean(result.truncated);
  const hostDidSlice =
    result.rows.length > limit || result.rowCount > limit;
  return {
    ffpTruncated,
    hostDidSlice,
    result: {
      columns: result.columns,
      rows: result.rows.slice(0, limit),
      rowCount: result.rowCount,
      truncated: ffpTruncated || hostDidSlice,
    },
  };
}
