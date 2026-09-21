import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataSource } from '@ai-bi/db';
import { CryptoService } from '../common/crypto.service';
import { mapSandboxError } from './error-map';
import type { ExecuteSqlFn, ExecuteSqlInput, ExecuteSqlResult } from './ffp-client';
import {
  DENIED_HOST_ERROR,
  EMPTY_HOST_ERROR,
  READ_ONLY_REQUIRED_ERROR,
} from './host-policy';
import { SandboxService } from './sandbox.service';

function dataSource(partial: Partial<DataSource> = {}): DataSource {
  return {
    id: 'ds-1',
    userId: 'user-1',
    name: 'analytics',
    type: 'POSTGRESQL',
    host: 'db.internal',
    port: 5432,
    database: 'app',
    username: 'readonly',
    password: 'enc-secret',
    isReadOnly: true,
    schemaDoc: null,
    connectionStatus: 'CONNECTED',
    lastSyncAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...partial,
  };
}

function cryptoStub(): CryptoService {
  return {
    decrypt: (ciphertext: string) => `plain:${ciphertext}`,
  } as CryptoService;
}

function capturingExecutor(
  impl?: (input: ExecuteSqlInput) => Promise<ExecuteSqlResult> | ExecuteSqlResult,
): { fn: ExecuteSqlFn; calls: ExecuteSqlInput[] } {
  const calls: ExecuteSqlInput[] = [];
  const fn: ExecuteSqlFn = async (input) => {
    calls.push(input);
    if (impl) {
      return impl(input);
    }
    return {
      ok: true,
      data: { columns: ['n'], rows: [[1]] },
    };
  };
  return { fn, calls };
}

describe('SandboxService adapter', () => {
  it('R1: refuses isReadOnly=false without calling ffp executeSql', async () => {
    const { fn, calls } = capturingExecutor();
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    const result = await service.execute(
      'SELECT 1',
      dataSource({ isReadOnly: false }),
    );
    assert.deepEqual(result, {
      success: false,
      error: READ_ONLY_REQUIRED_ERROR,
    });
    assert.equal(calls.length, 0);
  });

  it('rejects empty host without calling executeSql', async () => {
    const { fn, calls } = capturingExecutor();
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    const result = await service.execute(
      'SELECT 1',
      dataSource({ host: '   ' }),
    );
    assert.deepEqual(result, { success: false, error: EMPTY_HOST_ERROR });
    assert.equal(calls.length, 0);
  });

  it('denylist: rejects metadata / IMDS / docker gateway before executeSql', async () => {
    const { fn, calls } = capturingExecutor();
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    const hosts = [
      'metadata',
      ' Metadata.Google.Internal ',
      '169.254.169.254',
      'HOST.DOCKER.INTERNAL',
    ];
    for (const host of hosts) {
      const result = await service.execute('SELECT 1', dataSource({ host }));
      assert.equal(result.success, false, host);
      assert.equal(result.error, DENIED_HOST_ERROR, host);
    }
    assert.equal(calls.length, 0);
  });

  it('allowlist A: only the trimmed DataSource host, loopback allowed', async () => {
    const { fn, calls } = capturingExecutor();
    const service = new SandboxService(cryptoStub(), fn, async () => true);

    await service.execute(
      'SELECT 1',
      dataSource({ host: '  db.internal  ' }),
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].hostAllowlist, ['db.internal']);
    assert.equal(calls[0].connection.host, 'db.internal');
    assert.equal(calls[0].connection.type, 'postgres');
    assert.equal(calls[0].connection.password, 'plain:enc-secret');
    assert.equal('Env' in calls[0], false);
    assert.equal('image' in calls[0], false);

    await service.execute(
      'SELECT 1',
      dataSource({ host: '127.0.0.1', type: 'MYSQL', port: 3306 }),
    );
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].hostAllowlist, ['127.0.0.1']);
    assert.equal(calls[1].connection.host, '127.0.0.1');
    assert.equal(calls[1].connection.type, 'mysql');
  });

  it('passes image only when SANDBOX_IMAGE is explicitly set', async () => {
    const previous = process.env.SANDBOX_IMAGE;
    const { fn, calls } = capturingExecutor();
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    try {
      delete process.env.SANDBOX_IMAGE;
      await service.execute('SELECT 1', dataSource());
      assert.equal('image' in calls[0], false);

      process.env.SANDBOX_IMAGE = 'untrusted-override:dev';
      await service.execute('SELECT 1', dataSource());
      assert.equal(calls[1].image, 'untrusted-override:dev');
    } finally {
      if (previous === undefined) {
        delete process.env.SANDBOX_IMAGE;
      } else {
        process.env.SANDBOX_IMAGE = previous;
      }
    }
  });

  it('does not call executeSql when package validateSql fails', async () => {
    const { fn, calls } = capturingExecutor();
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    const result = await service.execute(
      'DELETE FROM orders',
      dataSource(),
    );
    assert.equal(result.success, false);
    assert.equal(result.error, mapSandboxError('NOT_READ_ONLY_PREFIX', ''));
    assert.equal(calls.length, 0);
  });

  it('maps HOST_NOT_ALLOWED and IMAGE_UNAVAILABLE separately from daemon ping', async () => {
    const { fn } = capturingExecutor(async () => ({
      ok: false,
      code: 'HOST_NOT_ALLOWED',
      error: 'not allowlisted',
    }));
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    const denied = await service.execute('SELECT 1', dataSource());
    assert.deepEqual(denied, {
      success: false,
      error: mapSandboxError('HOST_NOT_ALLOWED', 'not allowlisted'),
    });

    const imageService = new SandboxService(
      cryptoStub(),
      async () => ({
        ok: false,
        code: 'IMAGE_UNAVAILABLE',
        error: 'image missing',
      }),
      async () => true,
    );
    const imageFail = await imageService.execute('SELECT 1', dataSource());
    assert.equal(imageFail.success, false);
    assert.equal(
      imageFail.error,
      mapSandboxError('IMAGE_UNAVAILABLE', 'image missing'),
    );
    assert.equal(await imageService.checkDockerAvailable(), true);
  });

  it('maps DOCKER_UNAVAILABLE on execute without treating it as checkDockerAvailable', async () => {
    const service = new SandboxService(
      cryptoStub(),
      async () => ({
        ok: false,
        code: 'DOCKER_UNAVAILABLE',
        error: 'Cannot connect to the Docker daemon',
      }),
      async () => true,
    );
    const executed = await service.execute('SELECT 1', dataSource());
    assert.equal(executed.success, false);
    assert.equal(
      executed.error,
      mapSandboxError('DOCKER_UNAVAILABLE', 'Cannot connect to the Docker daemon'),
    );
    assert.equal(await service.checkDockerAvailable(), true);
  });

  it('checkDockerAvailable is daemon ping only', async () => {
    const up = new SandboxService(cryptoStub(), capturingExecutor().fn, async () => true);
    const down = new SandboxService(
      cryptoStub(),
      capturingExecutor().fn,
      async () => false,
    );
    assert.equal(await up.checkDockerAvailable(), true);
    assert.equal(await down.checkDockerAvailable(), false);
  });
});
