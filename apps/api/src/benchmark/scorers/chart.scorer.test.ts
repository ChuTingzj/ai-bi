import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoreChart } from './chart.scorer';

describe('scoreChart', () => {
  it('accepts a config whose first series has data', () => {
    assert.equal(
      scoreChart({
        title: { text: 'GMV' },
        series: [{ type: 'bar', data: [1, 2] }],
      }),
      true,
    );
  });

  it('rejects missing, empty, or data-less series', () => {
    assert.equal(scoreChart(null), false);
    assert.equal(scoreChart({}), false);
    assert.equal(scoreChart({ series: [] }), false);
    assert.equal(scoreChart({ series: [{ type: 'bar' }] }), false);
    assert.equal(scoreChart({ series: [{ type: 'bar', data: null }] }), false);
    assert.equal(scoreChart({ series: [{ type: 'bar', data: [] }] }), false);
    assert.equal(scoreChart({ series: 'not-an-array' }), false);
  });
});
