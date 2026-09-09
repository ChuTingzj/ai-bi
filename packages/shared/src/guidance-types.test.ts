import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isGuidanceMessageIntent } from '../src/guidance-types';

describe('isGuidanceMessageIntent', () => {
  it('accepts objects whose kind is guidance', () => {
    assert.equal(
      isGuidanceMessageIntent({
        kind: 'guidance',
        originalQuestion: '近30天销量',
        tables: [],
      }),
      true,
    );
  });

  it('rejects missing, wrong-kind, and non-object values', () => {
    assert.equal(isGuidanceMessageIntent(null), false);
    assert.equal(isGuidanceMessageIntent(undefined), false);
    assert.equal(isGuidanceMessageIntent('guidance'), false);
    assert.equal(isGuidanceMessageIntent({}), false);
    assert.equal(isGuidanceMessageIntent({ kind: 'query' }), false);
    assert.equal(isGuidanceMessageIntent({ kind: 'GUIDANCE' }), false);
  });
});
