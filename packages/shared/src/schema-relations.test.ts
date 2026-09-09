import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SchemaTableMeta } from '../src/guidance-types';
import {
  buildJoins,
  relatedTablesFor,
  validateGuidanceAgainstSchema,
} from '../src/schema-relations';

const tables: SchemaTableMeta[] = [
  {
    name: 'orders',
    columns: [
      { name: 'id', type: 'integer' },
      { name: 'user_id', type: 'integer' },
      { name: 'product_id', type: 'integer' },
    ],
    outgoingRelations: [
      {
        name: 'fk_orders_user',
        fromTable: 'orders',
        fromColumns: ['user_id'],
        toTable: 'users',
        toColumns: ['id'],
      },
      {
        name: 'fk_orders_product',
        fromTable: 'orders',
        fromColumns: ['product_id'],
        toTable: 'products',
        toColumns: ['id'],
      },
    ],
  },
  {
    name: 'users',
    columns: [{ name: 'id', type: 'integer' }],
  },
  {
    name: 'products',
    columns: [{ name: 'id', type: 'integer' }],
  },
  {
    name: 'order_items',
    columns: [
      { name: 'id', type: 'integer' },
      { name: 'order_id', type: 'integer' },
    ],
    outgoingRelations: [
      {
        name: 'fk_items_order',
        fromTable: 'order_items',
        fromColumns: ['order_id'],
        toTable: 'orders',
        toColumns: ['id'],
      },
    ],
  },
];

const schemaDoc = `
CREATE TABLE orders (
  id integer,
  user_id integer,
  product_id integer,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE TABLE users (
  id integer
);

CREATE TABLE products (
  id integer
);

CREATE TABLE order_items (
  id integer,
  order_id integer,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders (id)
);
`;

describe('relatedTablesFor', () => {
  it('returns outbound and inbound direct FK neighbors', () => {
    const related = relatedTablesFor(tables, 'orders');
    assert.deepEqual(
      related.map((r) => r.table).sort(),
      ['order_items', 'products', 'users'],
    );
    const users = related.find((r) => r.table === 'users');
    assert.equal(users?.hint, 'user_id → users.id');
    const items = related.find((r) => r.table === 'order_items');
    assert.equal(items?.hint, 'order_items.order_id → id');
  });
});

describe('buildJoins', () => {
  it('builds INNER joins for selected related tables', () => {
    const joins = buildJoins('orders', ['users', 'products'], tables);
    assert.deepEqual(joins, [
      {
        leftTable: 'orders',
        leftColumns: ['user_id'],
        rightTable: 'users',
        rightColumns: ['id'],
        type: 'INNER',
      },
      {
        leftTable: 'orders',
        leftColumns: ['product_id'],
        rightTable: 'products',
        rightColumns: ['id'],
        type: 'INNER',
      },
    ]);
  });

  it('skips related tables without a direct edge', () => {
    assert.deepEqual(buildJoins('orders', ['missing'], tables), []);
  });
});

describe('validateGuidanceAgainstSchema', () => {
  it('accepts a valid multi-table payload', () => {
    const result = validateGuidanceAgainstSchema(schemaDoc, {
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
    });
    assert.deepEqual(result, { ok: true });
  });

  it('rejects non-neighbor related tables', () => {
    const result = validateGuidanceAgainstSchema(schemaDoc, {
      tables: ['users', 'products'],
      fields: [],
      filters: [],
      joins: [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /无直接外键关联/);
    }
  });

  it('rejects mismatched joins', () => {
    const result = validateGuidanceAgainstSchema(schemaDoc, {
      tables: ['orders', 'users'],
      fields: [],
      filters: [],
      joins: [
        {
          leftTable: 'orders',
          leftColumns: ['id'],
          rightTable: 'users',
          rightColumns: ['id'],
          type: 'INNER',
        },
      ],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /无效的关联/);
    }
  });
});
