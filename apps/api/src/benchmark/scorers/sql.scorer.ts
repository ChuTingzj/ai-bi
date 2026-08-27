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

type Cell =
  | { kind: 'null' }
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string };

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return { kind: 'null' };
  if (isNumeric(value)) return { kind: 'num', value: toNumber(value) };
  return { kind: 'str', value: String(value).trim() };
}

function cellsEqual(a: Cell, b: Cell, numericTolerance: number): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'null') return true;
  if (a.kind === 'str' && b.kind === 'str') return a.value === b.value;
  if (a.kind === 'num' && b.kind === 'num') {
    const denom = Math.max(Math.abs(b.value), 1e-9);
    return Math.abs(a.value - b.value) / denom <= numericTolerance;
  }
  return false;
}

/** Strict: same columns (by name) + same values. */
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
      if (!cellsEqual(toCell(rowA[col]), toCell(rowE[col]), numericTolerance)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Value-only: ignore column names.
 * - Same row count required
 * - Each expected row must match an actual row by cell multiset
 * - If actual has more columns, expected cells may be a subset (extra agent columns OK)
 */
export function compareResultsByValue(
  actual: QueryResult | null,
  expected: QueryResult | null,
  numericTolerance = 0.01,
): boolean {
  if (!actual || !expected) return false;
  if (actual.rowCount !== expected.rowCount) return false;
  if (expected.rowCount === 0) return true;

  const expectedRows = expected.rows.map((row) =>
    expected.columns.map((col) => toCell(row[col])),
  );
  const actualRows = actual.rows.map((row) =>
    actual.columns.map((col) => toCell(row[col])),
  );

  const used = new Set<number>();
  for (const expCells of expectedRows) {
    let found = -1;
    for (let i = 0; i < actualRows.length; i++) {
      if (used.has(i)) continue;
      if (cellMultisetCovers(actualRows[i], expCells, numericTolerance)) {
        found = i;
        break;
      }
    }
    if (found < 0) return false;
    used.add(found);
  }
  return true;
}

/** actualCells covers expectedCells as a multiset (actual may have extras). */
function cellMultisetCovers(
  actualCells: Cell[],
  expectedCells: Cell[],
  numericTolerance: number,
): boolean {
  if (actualCells.length < expectedCells.length) return false;
  const pool = [...actualCells];
  for (const exp of expectedCells) {
    const idx = pool.findIndex((c) => cellsEqual(c, exp, numericTolerance));
    if (idx < 0) return false;
    pool.splice(idx, 1);
  }
  return true;
}

export function compareRowCounts(
  actual: QueryResult | null,
  expected: QueryResult | null,
): boolean {
  if (!actual || !expected) return false;
  return actual.rowCount === expected.rowCount;
}

export interface SqlScore {
  /** First attempt executed successfully (no sql_error, has result). */
  exec_at_1: boolean;
  /** Final execution succeeded (with up to 3 attempts). */
  exec_success: boolean;
  /** Strict gold match on first successful path (columns + values). */
  sql_at_1: boolean;
  /** Exec success or strict gold match within 3 attempts. */
  sql_at_3: boolean;
  /** Strict column-name + value match. */
  sql_result_match: boolean;
  /** Value match ignoring column names (and allowing extra columns). */
  sql_value_match: boolean;
  /** Row count equals gold. */
  sql_row_count_match: boolean;
}

export function scoreSql(params: {
  sql_attempts: number;
  sql_result: QueryResult | null;
  sql_error: string | null;
  fallback: boolean;
  gold_result: QueryResult | null;
  numeric_tolerance?: number;
}): SqlScore {
  const tol = params.numeric_tolerance ?? 0.01;
  const executedOk = !params.sql_error && params.sql_result !== null;
  const attempts = Math.max(params.sql_attempts, executedOk ? 1 : 0);

  const sql_result_match = compareResults(
    params.sql_result,
    params.gold_result,
    tol,
  );
  const sql_value_match = compareResultsByValue(
    params.sql_result,
    params.gold_result,
    tol,
  );
  const sql_row_count_match = compareRowCounts(
    params.sql_result,
    params.gold_result,
  );

  const exec_at_1 = attempts <= 1 && executedOk;
  const exec_success = executedOk && !params.fallback;
  const sql_at_3 =
    sql_result_match || (executedOk && params.sql_attempts <= 3 && !params.fallback);
  const sql_at_1 = exec_at_1 && sql_result_match;

  return {
    exec_at_1,
    exec_success,
    sql_at_1,
    sql_at_3,
    sql_result_match,
    sql_value_match,
    sql_row_count_match,
  };
}
