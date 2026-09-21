import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toQueryResult } from './query-result';

describe('toQueryResult', () => {
  it('maps unknown[][] rows onto records and disambiguates duplicate columns', () => {
    const result = toQueryResult({
      columns: ['id', 'id'],
      rows: [
        [1, 99],
        [2, 100],
      ],
    });
    assert.deepEqual(result.columns, ['id', 'id__2']);
    assert.deepEqual(result.rows, [
      { id: 1, id__2: 99 },
      { id: 2, id__2: 100 },
    ]);
    assert.equal(result.rowCount, 2);
    assert.equal(result.truncated, undefined);
  });

  it('keeps a third duplicate as col__3 and preserves date-like values', () => {
    const created = new Date('2024-06-01T00:00:00.000Z');
    const result = toQueryResult({
      columns: ['id', 'created_at', 'id'],
      rows: [[7, created, '2024-06-02']],
      truncated: true,
    });
    assert.deepEqual(result.columns, ['id', 'created_at', 'id__2']);
    assert.equal(result.rows[0].id, 7);
    assert.equal(result.rows[0].created_at, created);
    assert.equal(result.rows[0].id__2, '2024-06-02');
    assert.equal(result.rowCount, 1);
    assert.equal(result.truncated, true);
  });
});
