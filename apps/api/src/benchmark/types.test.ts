import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeQueryResult } from './types';

describe('normalizeQueryResult', () => {
  it('sorts columns and rows so comparison is order-insensitive', () => {
    const normalized = normalizeQueryResult({
      columns: ['gmv', 'day'],
      rows: [
        { day: '2024-01-02', gmv: 200 },
        { day: '2024-01-01', gmv: 100 },
      ],
      rowCount: 2,
    });

    assert.deepEqual(normalized, {
      columns: ['day', 'gmv'],
      rows: [
        { day: '2024-01-01', gmv: 100 },
        { day: '2024-01-02', gmv: 200 },
      ],
      rowCount: 2,
    });
  });
});
