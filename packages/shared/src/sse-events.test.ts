import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SseEvent } from '../src/sse-events';

describe('SseEvent shapes', () => {
  it('discriminates stream events by type with the fields callers persist', () => {
    const events: SseEvent[] = [
      { type: 'token', content: '洞察' },
      { type: 'chart', config: { series: [] } },
      { type: 'sql', query: 'SELECT 1', status: 'generated' },
      {
        type: 'result',
        data: { columns: ['n'], rows: [{ n: 1 }], rowCount: 1 },
      },
      {
        type: 'intent',
        intent: {
          summary: '销量',
          metrics: ['gmv'],
          dimensions: ['day'],
          filters: [],
        },
      },
      { type: 'guidance', originalQuestion: '看一下销量', tables: [] },
      { type: 'status', step: 'planning', message: '正在理解您的问题...' },
      { type: 'error', code: '1003', message: 'failed' },
      { type: 'title', title: '近30天销量' },
      { type: 'done', messageId: 'msg-1' },
    ];

    assert.deepEqual(
      events.map((e) => e.type),
      [
        'token',
        'chart',
        'sql',
        'result',
        'intent',
        'guidance',
        'status',
        'error',
        'title',
        'done',
      ],
    );
    assert.equal(events[2].type === 'sql' && events[2].status, 'generated');
    assert.equal(events[7].type === 'error' && events[7].code, '1003');
    assert.equal(events[9].type === 'done' && events[9].messageId, 'msg-1');
  });
});
