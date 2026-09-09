import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoreAnalyst } from './analyst.scorer';

describe('scoreAnalyst', () => {
  it('returns 0 for blank text and 1 when no keywords are required', () => {
    assert.equal(scoreAnalyst(''), 0);
    assert.equal(scoreAnalyst('   '), 0);
    assert.equal(scoreAnalyst('核心发现：销量上升'), 1);
    assert.equal(scoreAnalyst('核心发现：销量上升', []), 1);
  });

  it('returns the fraction of keywords found, case-insensitively', () => {
    assert.equal(scoreAnalyst('GMV rose in January', ['gmv', 'January']), 1);
    assert.equal(scoreAnalyst('GMV rose', ['gmv', 'refund']), 0.5);
    assert.equal(scoreAnalyst('no overlap', ['gmv', 'refund']), 0);
  });
});
