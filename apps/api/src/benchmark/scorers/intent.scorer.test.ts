import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { QueryIntent } from '@ai-bi/shared';
import type { GoldCase } from '../types';
import { scoreIntent } from './intent.scorer';

const goldCase: GoldCase = {
  id: 'c1',
  level: 'L1',
  question: '近30天销量',
  expected_tables: ['Orders', 'users'],
  expected_chart_type: 'bar',
  gold_sql: 'SELECT 1',
};

const intent: QueryIntent = {
  summary: '销量',
  metrics: ['gmv'],
  dimensions: ['day'],
  filters: [],
  chartType: 'bar',
  relevant_tables: ['orders'],
};

describe('scoreIntent', () => {
  it('computes table recall from relevant_tables, case-insensitively', () => {
    assert.deepEqual(scoreIntent(intent, ['orders', 'USERS'], goldCase), {
      table_recall: 1,
      chart_type_match: true,
    });
    assert.deepEqual(scoreIntent(intent, ['orders'], goldCase), {
      table_recall: 0.5,
      chart_type_match: true,
    });
    assert.deepEqual(scoreIntent(intent, [], goldCase), {
      table_recall: 0.5,
      chart_type_match: true,
    });
  });

  it('treats empty expected tables as full recall and optional chart type as a match', () => {
    assert.deepEqual(
      scoreIntent(intent, [], {
        ...goldCase,
        expected_tables: [],
        expected_chart_type: undefined,
      }),
      { table_recall: 1, chart_type_match: true },
    );
  });

  it('flags a chart type mismatch', () => {
    assert.deepEqual(
      scoreIntent({ ...intent, chartType: 'line' }, ['orders', 'users'], goldCase),
      { table_recall: 1, chart_type_match: false },
    );
    assert.deepEqual(
      scoreIntent(null, ['orders', 'users'], goldCase),
      { table_recall: 1, chart_type_match: false },
    );
  });
});
