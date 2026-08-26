import type { QueryResult } from '@ai-bi/shared';
import { normalizeQueryResult } from '../types';

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))) {
    return true;
  }
  return false;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  return Number(value);
}

export function compareResults(
  actual: QueryResult | null,
  expected: QueryResult | null,
  numericTolerance = 0.01,
): boolean {
  if (!actual || !expected) return false;

  const a = normalizeQueryResult(actual);
  const e = normalizeQueryResult(expected);

  if (a.rowCount !== e.rowCount) return false;
  if (a.columns.join(',') !== e.columns.join(',')) return false;

  for (let i = 0; i < a.rows.length; i++) {
    const rowA = a.rows[i];
    const rowE = e.rows[i];
    for (const col of a.columns) {
      const va = rowA[col];
      const ve = rowE[col];

      if (va === null && ve === null) continue;
      if (va === null || ve === null) return false;

      if (isNumeric(va) && isNumeric(ve)) {
        const numA = toNumber(va);
        const numE = toNumber(ve);
        const denom = Math.max(Math.abs(numE), 1e-9);
        if (Math.abs(numA - numE) / denom > numericTolerance) return false;
      } else if (String(va).trim() !== String(ve).trim()) {
        return false;
      }
    }
  }
  return true;
}

export function scoreSql(params: {
  sql_attempts: number;
  sql_result: QueryResult | null;
  sql_error: string | null;
  fallback: boolean;
  gold_result: QueryResult | null;
  numeric_tolerance?: number;
}): { sql_at_1: boolean; sql_at_3: boolean; sql_result_match: boolean } {
  const resultMatch = compareResults(
    params.sql_result,
    params.gold_result,
    params.numeric_tolerance ?? 0.01,
  );

  const executedOk = !params.sql_error && params.sql_result !== null;
  const sql_at_3 = resultMatch || (executedOk && !params.fallback);
  const sql_at_1 = params.sql_attempts <= 1 && sql_at_3 && resultMatch;

  return {
    sql_at_1,
    sql_at_3: resultMatch || (executedOk && params.sql_attempts <= 3),
    sql_result_match: resultMatch,
  };
}
