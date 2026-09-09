import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_SESSION_TITLE,
  MAX_SESSION_TITLE_LENGTH,
  clipTitle,
  heuristicTitle,
  sanitizeTitle,
} from '../src/session-title';

describe('clipTitle', () => {
  it('keeps text at or under MAX_SESSION_TITLE_LENGTH', () => {
    const overflow = '一二三四五六七八九十十一十二十三四';
    assert.equal(clipTitle('销量'), '销量');
    assert.equal(clipTitle(overflow), '一二三四五六七八九十十一十二十三');
    assert.equal(Array.from(clipTitle(overflow)).length, MAX_SESSION_TITLE_LENGTH);
  });

  it('counts Unicode code points, not UTF-16 units', () => {
    assert.equal(clipTitle('😀'.repeat(20)), '😀'.repeat(MAX_SESSION_TITLE_LENGTH));
  });
});

describe('heuristicTitle', () => {
  it('strips stacked polite prefixes and trailing punctuation', () => {
    assert.equal(heuristicTitle('请帮我看一下近30天销量？'), '近30天销量');
    assert.equal(heuristicTitle('帮我查一下订单趋势。'), '订单趋势');
    assert.equal(heuristicTitle('请问一下各渠道转化率！'), '各渠道转化率');
  });

  it('collapses whitespace before clipping', () => {
    assert.equal(heuristicTitle('  帮我   看一下   GMV  '), '看一下 GMV');
  });

  it('falls back to the original clipped question, or 数据分析 when nothing remains', () => {
    assert.equal(heuristicTitle('请帮我'), '请帮我');
    assert.equal(heuristicTitle('请帮我新对话'), '请帮我新对话');
    assert.equal(heuristicTitle(DEFAULT_SESSION_TITLE), DEFAULT_SESSION_TITLE);
    assert.equal(heuristicTitle('   '), '数据分析');
  });
});

describe('sanitizeTitle', () => {
  it('strips markdown fences, quotes, and 标题 prefixes', () => {
    assert.equal(sanitizeTitle('```text\n月度销量对比\n```', 'ignored'), '月度销量对比');
    assert.equal(sanitizeTitle('「渠道转化」', 'ignored'), '渠道转化');
    assert.equal(sanitizeTitle('标题：各省份GMV', 'ignored'), '各省份GMV');
    assert.equal(sanitizeTitle('会话标题: 复购率', 'ignored'), '复购率');
  });

  it('clips and drops trailing punctuation', () => {
    assert.equal(
      sanitizeTitle('近三十天各渠道订单量对比分析报告摘要。', 'ignored'),
      '近三十天各渠道订单量对比分析报告',
    );
  });

  it('uses heuristicTitle when sanitized text is empty or the default label', () => {
    assert.equal(sanitizeTitle('```\n```', '请帮我看一下退款率'), '退款率');
    assert.equal(sanitizeTitle(DEFAULT_SESSION_TITLE, '帮我查一下库存'), '库存');
    assert.equal(sanitizeTitle('   ', '   '), '数据分析');
  });
});
