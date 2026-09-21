import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { explicitSandboxImage, mapDialect, sandboxLimitsFromEnv } from './env';
import type { SandboxLimits } from './ffp-client';

const defaults: SandboxLimits = {
  timeoutMs: 10_000,
  memoryMb: 128,
  nanoCpus: 500_000_000,
  maxRows: 1_000,
  maxBytes: 1_000_000,
};

describe('sandbox env helpers', () => {
  it('omits image unless SANDBOX_IMAGE is explicitly set', () => {
    assert.equal(explicitSandboxImage({}), undefined);
    assert.equal(explicitSandboxImage({ SANDBOX_IMAGE: '' }), undefined);
    assert.equal(
      explicitSandboxImage({ SANDBOX_IMAGE: ' ghcr.io/example/untrusted:dev ' }),
      'ghcr.io/example/untrusted:dev',
    );
  });

  it('maps MYSQL to mysql and everything else postgres', () => {
    assert.equal(mapDialect('MYSQL'), 'mysql');
    assert.equal(mapDialect('POSTGRESQL'), 'postgres');
  });

  it('reads limits from env with ffp defaults', () => {
    assert.deepEqual(sandboxLimitsFromEnv(defaults, {}), {
      timeoutMs: 10_000,
      memoryMb: 128,
      maxRows: 1_000,
      maxBytes: 1_000_000,
    });
    assert.deepEqual(
      sandboxLimitsFromEnv(defaults, {
        SANDBOX_TIMEOUT_MS: '15000',
        SANDBOX_MEMORY_MB: '256',
        SANDBOX_MAX_ROWS: '50',
        SANDBOX_MAX_BYTES: '4096',
      }),
      {
        timeoutMs: 15_000,
        memoryMb: 256,
        maxRows: 50,
        maxBytes: 4096,
      },
    );
  });
});
