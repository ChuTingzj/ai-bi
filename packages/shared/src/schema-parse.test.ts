import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSchemaDoc } from '../src/schema-parse';

describe('parseSchemaDoc column types', () => {
  it('strips parenthetical params including commas from type tokens', () => {
    const tables = parseSchemaDoc(`
CREATE TABLE products (
  price numeric(12, 2),
  name varchar(255)
);
`);
    assert.equal(tables.length, 1);
    const price = tables[0].columns.find((c) => c.name === 'price');
    const name = tables[0].columns.find((c) => c.name === 'name');
    assert.equal(price?.type, 'numeric');
    assert.equal(name?.type, 'varchar');
  });
});
