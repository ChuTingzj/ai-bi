import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GuidancePayload, SchemaTableMeta } from '@ai-bi/shared';
import {
  buildGuidanceMessage,
  columnsForTables,
  operatorNeedsValue,
  qualifyField,
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

describe('qualifyField', () => {
  it('joins table and column with a dot', () => {
    assert.equal(qualifyField('orders', 'gmv'), 'orders.gmv');
  });
});

describe('buildGuidanceMessage', () => {
  it('includes association clause and joins for multi-table payloads', () => {
    const payload: GuidancePayload = {
      tables: ['orders', 'users'],
      fields: ['orders.gmv', 'users.email'],
      filters: [
        { field: 'orders.status', operator: '=', value: 'paid' },
        { field: 'orders.coupon', operator: 'IS NULL' },
      ],
      joins: [
        {
          leftTable: 'orders',
          leftColumns: ['user_id'],
          rightTable: 'users',
          rightColumns: ['id'],
          type: 'INNER',
        },
      ],
    };
    assert.equal(
      buildGuidanceMessage('近30天销量', payload),
      '基于表 orders（关联 users），关联 orders.user_id=users.id，字段 orders.gmv, users.email，条件 orders.status = paid AND orders.coupon IS NULL，原问题：近30天销量',
    );
  });

  it('uses placeholders when fields or filters are empty', () => {
    const payload: GuidancePayload = {
      tables: ['orders'],
      fields: [],
      filters: [],
      joins: [],
    };
    assert.equal(
      buildGuidanceMessage('看一下订单', payload),
      '基于表 orders，字段 （未指定），条件 无，原问题：看一下订单',
    );
  });

  it('keeps single-table shape when joins are empty', () => {
    const payload: GuidancePayload = {
      tables: ['orders'],
      fields: ['orders.gmv'],
      filters: [],
      joins: [],
    };
    assert.equal(
      buildGuidanceMessage('看 GMV', payload),
      '基于表 orders，字段 orders.gmv，条件 无，原问题：看 GMV',
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
