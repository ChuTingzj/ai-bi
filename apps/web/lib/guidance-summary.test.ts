import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GuidancePayload, SchemaTableMeta } from '@ai-bi/shared';
import {
  buildGuidanceMessage,
  columnsForTables,
  operatorNeedsValue,
} from '../app/chat/[sessionId]/_components/guidance/guidance-summary';

const tables: SchemaTableMeta[] = [
  {
    name: 'Orders',
    columns: [
      { name: 'id', type: 'integer' },
      { name: 'gmv', type: 'numeric' },
    ],
  },
  {
    name: 'users',
    columns: [{ name: 'email', type: 'text' }],
  },
];

describe('buildGuidanceMessage', () => {
  it('joins selected tables, fields, and filters into the resubmit sentence', () => {
    const payload: GuidancePayload = {
      tables: ['orders', 'users'],
      fields: ['gmv', 'email'],
      filters: [
        { field: 'status', operator: '=', value: 'paid' },
        { field: 'coupon', operator: 'IS NULL' },
      ],
    };
    assert.equal(
      buildGuidanceMessage('近30天销量', payload),
      '基于表 orders, users，字段 gmv, email，条件 status = paid AND coupon IS NULL，原问题：近30天销量',
    );
  });

  it('uses placeholders when fields or filters are empty', () => {
    const payload: GuidancePayload = {
      tables: ['orders'],
      fields: [],
      filters: [],
    };
    assert.equal(
      buildGuidanceMessage('看一下订单', payload),
      '基于表 orders，字段 （未指定），条件 无，原问题：看一下订单',
    );
  });
});

describe('columnsForTables', () => {
  it('returns columns for selected tables, matching names case-insensitively', () => {
    assert.deepEqual(columnsForTables(tables, ['orders']), [
      { table: 'Orders', name: 'id', type: 'integer' },
      { table: 'Orders', name: 'gmv', type: 'numeric' },
    ]);
    assert.deepEqual(columnsForTables(tables, []), []);
    assert.deepEqual(columnsForTables(tables, ['missing']), []);
  });
});

describe('operatorNeedsValue', () => {
  it('is false only for IS NULL / IS NOT NULL', () => {
    assert.equal(operatorNeedsValue('='), true);
    assert.equal(operatorNeedsValue('LIKE'), true);
    assert.equal(operatorNeedsValue('IN'), true);
    assert.equal(operatorNeedsValue('IS NULL'), false);
    assert.equal(operatorNeedsValue('IS NOT NULL'), false);
  });
});
