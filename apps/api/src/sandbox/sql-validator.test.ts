import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateSql } from './sql-validator';

const PREFIX_REASON = '仅允许 SELECT / WITH / SHOW / DESCRIBE / EXPLAIN 语句';
const DML_REASON =
  '检测到被禁止的 SQL 模式: /\\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\\b/i';
const EXEC_REASON = '检测到被禁止的 SQL 模式: /\\b(EXEC|EXECUTE|xp_)\\b/i';
const MULTI_REASON = '检测到被禁止的 SQL 模式: /;\\s*\\S/';

describe('validateSql allowlist', () => {
  it('accepts SELECT / WITH / SHOW / DESCRIBE / EXPLAIN, including leading whitespace and case folding', () => {
    assert.deepEqual(validateSql('SELECT 1'), { valid: true });
    assert.deepEqual(validateSql('  select id from orders'), { valid: true });
    assert.deepEqual(
      validateSql('WITH cte AS (SELECT 1 AS x) SELECT * FROM cte'),
      { valid: true },
    );
    assert.deepEqual(validateSql('\n\tshow tables'), { valid: true });
    assert.deepEqual(validateSql('DESCRIBE users'), { valid: true });
    assert.deepEqual(validateSql('EXPLAIN SELECT * FROM orders'), {
      valid: true,
    });
    assert.deepEqual(validateSql('EXPLAIN ANALYZE SELECT 1'), { valid: true });
  });

  it('accepts a trailing semicolon with no following statement', () => {
    assert.deepEqual(validateSql('SELECT 1;'), { valid: true });
  });
});

describe('validateSql prefix rejection', () => {
  it('rejects empty input and statements outside the allowlist', () => {
    assert.deepEqual(validateSql(''), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('   '), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('CALL do_something()'), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('-- SELECT 1\nSELECT 1'), {
      valid: false,
      reason: PREFIX_REASON,
    });
  });
});

describe('validateSql DML/DDL rejection', () => {
  it('rejects DML and DDL even when they use an allowed prefix', () => {
    assert.deepEqual(validateSql('INSERT INTO t VALUES (1)'), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('DELETE FROM t'), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('UPDATE t SET a = 1'), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('DROP TABLE t'), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('ALTER TABLE t ADD col int'), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('TRUNCATE TABLE t'), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('CREATE TABLE t (id int)'), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('GRANT SELECT ON t TO u'), {
      valid: false,
      reason: PREFIX_REASON,
    });
    assert.deepEqual(validateSql('REVOKE SELECT ON t FROM u'), {
      valid: false,
      reason: PREFIX_REASON,
    });
  });

  it('rejects forbidden keywords embedded after an allowed prefix', () => {
    assert.deepEqual(validateSql("SELECT * FROM t WHERE action = 'UPDATE'"), {
      valid: false,
      reason: DML_REASON,
    });
    assert.deepEqual(validateSql('SELECT 1; DROP TABLE t'), {
      valid: false,
      reason: DML_REASON,
    });
    assert.deepEqual(validateSql('SELECT * FROM t; CREATE INDEX i ON t(id)'), {
      valid: false,
      reason: DML_REASON,
    });
  });

  it('rejects EXEC / EXECUTE / xp_ after an allowed prefix', () => {
    assert.deepEqual(validateSql('SELECT EXEC("x")'), {
      valid: false,
      reason: EXEC_REASON,
    });
    assert.deepEqual(validateSql('SELECT 1 FROM t WHERE fn = EXECUTE'), {
      valid: false,
      reason: EXEC_REASON,
    });
    assert.deepEqual(validateSql('SELECT xp_ FROM t'), {
      valid: false,
      reason: EXEC_REASON,
    });
  });

  it('rejects a second statement after a semicolon', () => {
    assert.deepEqual(validateSql('SELECT 1; SELECT 2'), {
      valid: false,
      reason: MULTI_REASON,
    });
    assert.deepEqual(validateSql('SHOW TABLES;\nSHOW DATABASES'), {
      valid: false,
      reason: MULTI_REASON,
    });
  });

  it('does not treat substrings of allowed identifiers as DML/DDL', () => {
    assert.deepEqual(validateSql('SELECT created_at, updated_at FROM orders'), {
      valid: true,
    });
    assert.deepEqual(validateSql('SELECT inserted_at FROM events'), {
      valid: true,
    });
    assert.deepEqual(
      validateSql("SELECT * FROM t WHERE status = 'deleted'"),
      { valid: true },
    );
  });
});
