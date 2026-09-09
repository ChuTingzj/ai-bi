import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { questionLacksAnalyticSignal } from './planner-guard';

describe('questionLacksAnalyticSignal', () => {
  it('flags digit-only and empty questions', () => {
    assert.equal(questionLacksAnalyticSignal('123321'), true);
    assert.equal(questionLacksAnalyticSignal('  42  '), true);
    assert.equal(questionLacksAnalyticSignal(''), true);
    assert.equal(questionLacksAnalyticSignal('!!!'), true);
  });

  it('allows questions with letters or CJK', () => {
    assert.equal(questionLacksAnalyticSignal('近30天销量'), false);
    assert.equal(questionLacksAnalyticSignal('orders gmv'), false);
    assert.equal(questionLacksAnalyticSignal('数字123321解读'), false);
  });
});
