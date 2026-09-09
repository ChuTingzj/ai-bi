import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatGuidanceBlock } from './guidance-format';

describe('formatGuidanceBlock', () => {
  it('includes JOIN lines for multi-table guidance', () => {
    const text = formatGuidanceBlock({
      tables: ['orders', 'users'],
      fields: ['orders.gmv', 'users.name'],
      filters: [{ field: 'orders.status', operator: '=', value: 'paid' }],
      joins: [
        {
          leftTable: 'orders',
          leftColumns: ['user_id'],
          rightTable: 'users',
          rightColumns: ['id'],
          type: 'INNER',
        },
      ],
    });
    assert.match(text, /JOIN：orders\.user_id = users\.id \(INNER\)/);
    assert.match(text, /必须使用上述 INNER JOIN/);
    assert.match(text, /字段：orders\.gmv, users\.name/);
  });

  it('omits JOIN section for single-table guidance', () => {
    const text = formatGuidanceBlock({
      tables: ['orders'],
      fields: ['orders.gmv'],
      filters: [],
      joins: [],
    });
    assert.doesNotMatch(text, /JOIN：/);
  });

  it('formats composite join keys with AND', () => {
    const text = formatGuidanceBlock({
      tables: ['a', 'b'],
      fields: [],
      filters: [],
      joins: [
        {
          leftTable: 'a',
          leftColumns: ['x', 'y'],
          rightTable: 'b',
          rightColumns: ['x', 'y'],
          type: 'INNER',
        },
      ],
    });
    assert.match(text, /JOIN：a\.x = b\.x AND a\.y = b\.y \(INNER\)/);
  });
});
