import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatStreamDto } from './chat.dto';

const valid = {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  message: '近30天销量',
};

describe('ChatStreamDto', () => {
  it('accepts a minimal valid stream request', async () => {
    const dto = plainToInstance(ChatStreamDto, valid);
    assert.deepEqual(await validate(dto), []);
  });

  it('rejects a missing message and a non-UUID sessionId', async () => {
    const dto = plainToInstance(ChatStreamDto, {
      sessionId: 'not-a-uuid',
      message: '',
    });
    const errors = await validate(dto);
    const props = new Set(errors.map((e) => e.property));
    assert.ok(props.has('sessionId'));
    assert.ok(props.has('message'));
  });

  it('rejects an unknown guidance filter operator', async () => {
    const dto = plainToInstance(ChatStreamDto, {
      ...valid,
      guidance: {
        tables: ['orders'],
        fields: ['gmv'],
        filters: [{ field: 'status', operator: 'BETWEEN', value: 'a' }],
      },
    });
    const errors = await validate(dto);
    assert.ok(errors.some((e) => e.property === 'guidance'));
    const nested = errors.find((e) => e.property === 'guidance');
    const filterErrors = nested?.children?.[0]
      ? nested.children
      : nested?.children;
    assert.ok(filterErrors && filterErrors.length > 0);
  });

  it('accepts IS NULL filters without a value', async () => {
    const dto = plainToInstance(ChatStreamDto, {
      ...valid,
      afterGuidance: true,
      dataSourceId: '550e8400-e29b-41d4-a716-446655440001',
      guidance: {
        tables: ['orders'],
        fields: ['gmv'],
        filters: [{ field: 'coupon', operator: 'IS NULL' }],
      },
    });
    assert.deepEqual(await validate(dto), []);
  });

  it('accepts guidance joins with INNER type', async () => {
    const dto = plainToInstance(ChatStreamDto, {
      ...valid,
      guidance: {
        tables: ['orders', 'users'],
        fields: ['orders.gmv'],
        filters: [],
        joins: [
          {
            leftTable: 'orders',
            leftColumns: ['user_id'],
            rightTable: 'users',
            rightColumns: ['id'],
            type: 'INNER',
          },
        ],
      },
    });
    assert.deepEqual(await validate(dto), []);
  });

  it('rejects guidance joins with non-INNER type', async () => {
    const dto = plainToInstance(ChatStreamDto, {
      ...valid,
      guidance: {
        tables: ['orders', 'users'],
        fields: ['orders.gmv'],
        filters: [],
        joins: [
          {
            leftTable: 'orders',
            leftColumns: ['user_id'],
            rightTable: 'users',
            rightColumns: ['id'],
            type: 'LEFT',
          },
        ],
      },
    });
    const errors = await validate(dto);
    assert.ok(errors.some((e) => e.property === 'guidance'));
  });
});
