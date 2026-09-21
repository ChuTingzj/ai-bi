import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateSql } from './ffp-client';

describe('package validateSql (Lab + SandboxService)', () => {
  it('accepts read-only prefixes via ffp-sql-sandbox', async () => {
    assert.deepEqual(await validateSql('SELECT 1'), { ok: true });
    assert.deepEqual(
      await validateSql('WITH cte AS (SELECT 1 AS x) SELECT * FROM cte'),
      { ok: true },
    );
  });

  it('rejects writes with the package result shape (ok/code/reason)', async () => {
    const result = await validateSql('DELETE FROM t');
    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail('expected failure');
    }
    assert.equal(result.code, 'NOT_READ_ONLY_PREFIX');
    assert.equal(typeof result.reason, 'string');
  });
});
