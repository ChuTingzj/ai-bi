import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { QueryResult } from '@ai-bi/shared';
import {
  compareResults,
  compareResultsByValue,
  compareRowCounts,
  scoreSql,
} from './sql.scorer';

function result(
  columns: string[],
  rows: Record<string, unknown>[],
): QueryResult {
  return { columns, rows, rowCount: rows.length };
}

const gold = result(['day', 'gmv'], [
  { day: '2024-01-01', gmv: 100 },
  { day: '2024-01-02', gmv: 200 },
]);

describe('compareResults', () => {
  it('requires both sides, same columns, and same cell values', () => {
    assert.equal(compareResults(null, gold), false);
    assert.equal(compareResults(gold, null), false);
    assert.equal(compareResults(gold, gold), true);
    assert.equal(
      compareResults(
        result(['gmv', 'day'], [
          { day: '2024-01-02', gmv: 200 },
          { day: '2024-01-01', gmv: 100 },
        ]),
        gold,
      ),
      true,
    );
    assert.equal(
      compareResults(result(['day', 'revenue'], gold.rows), gold),
      false,
    );
    assert.equal(
      compareResults(result(['day', 'gmv'], [{ day: '2024-01-01', gmv: 100 }]), gold),
      false,
    );
  });

  it('allows numeric values within the default 1% relative tolerance', () => {
    const close = result(['day', 'gmv'], [
      { day: '2024-01-01', gmv: 100.5 },
      { day: '2024-01-02', gmv: '200' },
    ]);
    assert.equal(compareResults(close, gold), true);
    const far = result(['day', 'gmv'], [
      { day: '2024-01-01', gmv: 103 },
      { day: '2024-01-02', gmv: 200 },
    ]);
    assert.equal(compareResults(far, gold), false);
  });
});

describe('compareResultsByValue', () => {
  it('matches rows as a cell multiset and allows extra actual columns', () => {
    const extraCol = result(
      ['day', 'gmv', 'note'],
      [
        { day: '2024-01-02', gmv: 200, note: 'b' },
        { day: '2024-01-01', gmv: 100, note: 'a' },
      ],
    );
    assert.equal(compareResultsByValue(extraCol, gold), true);
    assert.equal(
      compareResultsByValue(result(['x'], [{ x: 1 }]), gold),
      false,
    );
    assert.equal(compareResultsByValue(null, gold), false);
    assert.equal(
      compareResultsByValue(result(['a'], []), result(['a'], [])),
      true,
    );
  });
});

describe('compareRowCounts', () => {
  it('compares rowCount only', () => {
    assert.equal(compareRowCounts(gold, result(['x'], [{ x: 1 }, { x: 2 }])), true);
    assert.equal(compareRowCounts(gold, result(['x'], [{ x: 1 }])), false);
    assert.equal(compareRowCounts(null, gold), false);
  });
});

describe('scoreSql', () => {
  it('scores a first-try exact match', () => {
    assert.deepEqual(
      scoreSql({
        sql_attempts: 1,
        sql_result: gold,
        sql_error: null,
        fallback: false,
        gold_result: gold,
      }),
      {
        exec_at_1: true,
        exec_success: true,
        sql_at_1: true,
        sql_at_3: true,
        sql_result_match: true,
        sql_value_match: true,
        sql_row_count_match: true,
      },
    );
  });

  it('treats fallback as execution failure even when a result exists', () => {
    const score = scoreSql({
      sql_attempts: 3,
      sql_result: gold,
      sql_error: null,
      fallback: true,
      gold_result: gold,
    });
    assert.equal(score.exec_success, false);
    assert.equal(score.sql_at_3, true);
    assert.equal(score.sql_result_match, true);
  });

  it('does not award exec_at_1 after retries', () => {
    const score = scoreSql({
      sql_attempts: 2,
      sql_result: gold,
      sql_error: null,
      fallback: false,
      gold_result: gold,
    });
    assert.equal(score.exec_at_1, false);
    assert.equal(score.sql_at_1, false);
    assert.equal(score.exec_success, true);
    assert.equal(score.sql_at_3, true);
  });

  it('scores a failed execution with no result', () => {
    assert.deepEqual(
      scoreSql({
        sql_attempts: 3,
        sql_result: null,
        sql_error: 'relation "x" does not exist',
        fallback: true,
        gold_result: gold,
      }),
      {
        exec_at_1: false,
        exec_success: false,
        sql_at_1: false,
        sql_at_3: false,
        sql_result_match: false,
        sql_value_match: false,
        sql_row_count_match: false,
      },
    );
  });
});
