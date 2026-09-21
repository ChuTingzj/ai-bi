import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyHostRowLimit } from './host-row-limit';

describe('applyHostRowLimit truncated flag', () => {
  it('keeps ffp truncated when the host does not slice', () => {
    const applied = applyHostRowLimit(
      {
        columns: ['n'],
        rows: [{ n: 1 }, { n: 2 }],
        rowCount: 2,
        truncated: true,
      },
      10,
    );
    assert.equal(applied.ffpTruncated, true);
    assert.equal(applied.hostDidSlice, false);
    assert.equal(applied.result.truncated, true);
    assert.equal(applied.result.rows.length, 2);
  });

  it('sets truncated when the host slices even if ffp did not', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ n: i }));
    const applied = applyHostRowLimit(
      {
        columns: ['n'],
        rows,
        rowCount: 5,
        truncated: false,
      },
      3,
    );
    assert.equal(applied.ffpTruncated, false);
    assert.equal(applied.hostDidSlice, true);
    assert.equal(applied.result.truncated, true);
    assert.equal(applied.result.rows.length, 3);
    assert.equal(applied.result.rowCount, 5);
  });

  it('ORs ffp truncated with host slice', () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ n: i }));
    const applied = applyHostRowLimit(
      {
        columns: ['n'],
        rows,
        rowCount: 4,
        truncated: true,
      },
      2,
    );
    assert.equal(applied.result.truncated, true);
    assert.equal(applied.ffpTruncated, true);
    assert.equal(applied.hostDidSlice, true);
  });

  it('leaves truncated unset when neither ffp nor the host sliced', () => {
    const applied = applyHostRowLimit(
      {
        columns: ['n'],
        rows: [{ n: 1 }],
        rowCount: 1,
      },
      10,
    );
    assert.equal(applied.ffpTruncated, false);
    assert.equal(applied.hostDidSlice, false);
    assert.equal(applied.result.truncated, undefined);
  });
});
