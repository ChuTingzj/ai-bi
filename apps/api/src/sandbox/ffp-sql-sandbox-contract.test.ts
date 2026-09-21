import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { DataSource } from '@ai-bi/db';
import type { QueryResult } from '@ai-bi/shared';
import { CryptoService } from '../common/crypto.service';
import { createNodes } from '../agent/graph/nodes';
import type { BiAgentState } from '../agent/graph/state';
import type {
  ExecuteSqlFn,
  ExecuteSqlInput,
  ExecuteSqlResult,
} from './ffp-client';
import { applyHostRowLimit, RESULT_ROW_LIMIT } from './host-row-limit';
import {
  DENIED_HOST_ERROR,
  isDeniedHost,
  READ_ONLY_REQUIRED_ERROR,
} from './host-policy';
import { toQueryResult } from './query-result';
import { SandboxService } from './sandbox.service';

const API_ROOT = process.cwd();
const SRC_ROOT = path.join(API_ROOT, 'src');
const SANDBOX_DIR = path.join(SRC_ROOT, 'sandbox');

const LOCKED_DENYLIST = [
  'metadata',
  'metadata.google.internal',
  '169.254.169.254',
  'host.docker.internal',
] as const;

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0'] as const;

function walkProductionTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      out.push(...walkProductionTs(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

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
  impl?: (
    input: ExecuteSqlInput,
  ) => Promise<ExecuteSqlResult> | ExecuteSqlResult,
): { fn: ExecuteSqlFn; calls: ExecuteSqlInput[] } {
  const calls: ExecuteSqlInput[] = [];
  const fn: ExecuteSqlFn = async (input) => {
    calls.push(input);
    if (impl) return impl(input);
    return { ok: true, data: { columns: ['n'], rows: [[1]] } };
  };
  return { fn, calls };
}

describe('1. package pin ffp-sql-sandbox@0.1.3', () => {
  it('is an exact production dependency', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(API_ROOT, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    assert.equal(pkg.dependencies?.['ffp-sql-sandbox'], '0.1.3');
    assert.equal(pkg.devDependencies?.['ffp-sql-sandbox'], undefined);
  });

  it('is locked at 0.1.3 in pnpm-lock.yaml', () => {
    const lockfile = readFileSync(
      path.join(API_ROOT, '../../pnpm-lock.yaml'),
      'utf8',
    );
    assert.match(lockfile, /ffp-sql-sandbox@0\.1\.3:/);
  });
});

describe('2. no residual local dockerode execute / local validator', () => {
  it('sql-validator.ts is gone', () => {
    assert.equal(existsSync(path.join(SANDBOX_DIR, 'sql-validator.ts')), false);
  });

  it('production sources do not import sql-validator', () => {
    const offenders: string[] = [];
    for (const file of walkProductionTs(SRC_ROOT)) {
      const text = readFileSync(file, 'utf8');
      if (/from ['"].*sql-validator['"]/.test(text)) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('sandbox.service.ts does not create containers or import dockerode', () => {
    const src = readFileSync(path.join(SANDBOX_DIR, 'sandbox.service.ts'), 'utf8');
    assert.doesNotMatch(src, /from ['"]dockerode['"]/);
    assert.doesNotMatch(src, /createContainer/);
    assert.doesNotMatch(src, /new Docker\s*\(/);
    assert.match(src, /executeSqlFn/);
  });
});

describe('3. password never in container Env', () => {
  it('SandboxService.execute does not pass Env to ffp', async () => {
    const { fn, calls } = capturingExecutor();
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    await service.execute('SELECT 1', dataSource());
    assert.equal(calls.length, 1);
    assert.equal('Env' in calls[0]!, false);
    assert.equal(JSON.stringify(calls[0]).includes('DB_PASS'), false);
    assert.equal(JSON.stringify(calls[0]).includes('PGPASSWORD'), false);
    assert.equal(calls[0]!.connection.password, 'plain:enc-secret');
  });

  it('adapter sources do not mention password env vars', () => {
    const src = readFileSync(path.join(SANDBOX_DIR, 'sandbox.service.ts'), 'utf8');
    assert.equal(src.includes('DB_PASS'), false);
    assert.equal(src.includes('PGPASSWORD'), false);
    assert.equal(src.includes('MYSQL_PWD'), false);
  });
});

describe('4. hostAllowlist A = dataSource.host only', () => {
  it('passes only the trimmed DataSource host', async () => {
    const { fn, calls } = capturingExecutor();
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    await service.execute(
      'SELECT 1',
      dataSource({ host: '  db.internal  ' }),
    );
    assert.deepEqual(calls[0]!.hostAllowlist, ['db.internal']);
    assert.equal(calls[0]!.hostAllowlist.length, 1);
    assert.equal(calls[0]!.connection.host, 'db.internal');
  });
});

describe('5. denylist exact reject; registered loopback allowed', () => {
  it('rejects each locked host exactly', async () => {
    const { fn, calls } = capturingExecutor();
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    for (const host of LOCKED_DENYLIST) {
      assert.equal(isDeniedHost(host), true, host);
      const result = await service.execute('SELECT 1', dataSource({ host }));
      assert.deepEqual(
        result,
        { success: false, error: DENIED_HOST_ERROR },
        host,
      );
    }
    assert.equal(calls.length, 0);
  });

  it('does not treat substrings as denylist hits', () => {
    assert.equal(isDeniedHost('not-metadata'), false);
    assert.equal(isDeniedHost('metadata.google.internal.evil'), false);
    assert.equal(isDeniedHost('docker.internal'), false);
  });

  it('allows a registered loopback dataSource.host through allowlist A', async () => {
    const { fn, calls } = capturingExecutor();
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    for (const host of LOOPBACK_HOSTS) {
      assert.equal(isDeniedHost(host), false, host);
      const result = await service.execute('SELECT 1', dataSource({ host }));
      assert.equal(result.success, true, host);
    }
    assert.equal(calls.length, LOOPBACK_HOSTS.length);
    assert.deepEqual(
      calls.map((c) => c.hostAllowlist),
      LOOPBACK_HOSTS.map((host) => [host]),
    );
    assert.deepEqual(
      calls.map((c) => c.connection.host),
      [...LOOPBACK_HOSTS],
    );
  });
});

describe('6. R1 isReadOnly=false rejects', () => {
  it('refuses without calling executeSql', async () => {
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
});

describe('7. duplicate columns disambiguated as col__2', () => {
  it('maps through SandboxService.execute', async () => {
    const { fn } = capturingExecutor(() => ({
      ok: true,
      data: {
        columns: ['col', 'col'],
        rows: [['left', 'right']],
      },
    }));
    const service = new SandboxService(cryptoStub(), fn, async () => true);
    const result = await service.execute('SELECT 1', dataSource());
    assert.equal(result.success, true);
    assert.deepEqual(result.data?.columns, ['col', 'col__2']);
    assert.deepEqual(result.data?.rows, [{ col: 'left', col__2: 'right' }]);
  });

  it('uses the same col / col__2 / col__3 pattern in toQueryResult', () => {
    const mapped = toQueryResult({
      columns: ['col', 'col', 'col'],
      rows: [[1, 2, 3]],
    });
    assert.deepEqual(mapped.columns, ['col', 'col__2', 'col__3']);
    assert.deepEqual(mapped.rows, [{ col: 1, col__2: 2, col__3: 3 }]);
  });
});

function executorState(): BiAgentState {
  return {
    question: '',
    intent: null,
    relevant_tables: [],
    table_schema: '',
    generated_sql: 'SELECT 1',
    sql_result: null,
    sql_error: null,
    chart_config: null,
    error_count: 0,
    data_source_id: 'ds-1',
    session_id: '',
    analyst_text: '',
    after_guidance: false,
    guidance: null,
    schema_doc: '',
  };
}

function graphNodesWithSandboxData(data: QueryResult) {
  return createNodes({
    prisma: {
      dataSource: {
        findUnique: async () => ({ id: 'ds-1', host: 'db.internal' }),
      },
    } as never,
    sandbox: {
      execute: async () => ({ success: true, data }),
    } as never,
    llm: {} as never,
  });
}

describe('8. host re-slice sets truncated: true', () => {
  it('keeps truncated when ffp already truncated under the host limit', () => {
    const applied = applyHostRowLimit({
      columns: ['n'],
      rows: [{ n: 1 }],
      rowCount: 1,
      truncated: true,
    });
    assert.equal(applied.result.truncated, true);
    assert.equal(applied.ffpTruncated, true);
    assert.equal(applied.hostDidSlice, false);
  });

  it('sets truncated: true when the host slices after sandbox truncate', () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ n: i }));
    const applied = applyHostRowLimit(
      {
        columns: ['n'],
        rows,
        rowCount: 4,
        truncated: true,
      },
      2,
    );
    assert.equal(applied.hostDidSlice, true);
    assert.equal(applied.ffpTruncated, true);
    assert.equal(applied.result.truncated, true);
    assert.equal(applied.result.rows.length, 2);
  });

  it('sqlExecutorNode wires applyHostRowLimit: host re-slice sets truncated on sql_result', async () => {
    const rows = Array.from({ length: RESULT_ROW_LIMIT + 1 }, (_, i) => ({
      n: i,
    }));
    const nodes = graphNodesWithSandboxData({
      columns: ['n'],
      rows,
      rowCount: RESULT_ROW_LIMIT + 1,
      truncated: false,
    });
    const out = await nodes.sqlExecutorNode(executorState());
    assert.equal(out.sql_error, null);
    assert.equal(out.sql_result?.truncated, true);
    assert.equal(out.sql_result?.rows.length, RESULT_ROW_LIMIT);
    assert.equal(out.sql_result?.rowCount, RESULT_ROW_LIMIT + 1);
  });

  it('sqlExecutorNode keeps truncated when ffp truncated and the host also slices', async () => {
    const rows = Array.from({ length: RESULT_ROW_LIMIT + 5 }, (_, i) => ({
      n: i,
    }));
    const nodes = graphNodesWithSandboxData({
      columns: ['n'],
      rows,
      rowCount: RESULT_ROW_LIMIT + 5,
      truncated: true,
    });
    const out = await nodes.sqlExecutorNode(executorState());
    assert.equal(out.sql_result?.truncated, true);
    assert.equal(out.sql_result?.rows.length, RESULT_ROW_LIMIT);
  });

  it('sqlExecutorNode source actually calls applyHostRowLimit', () => {
    const src = readFileSync(
      path.join(SRC_ROOT, 'agent/graph/nodes.ts'),
      'utf8',
    );
    assert.match(src, /applyHostRowLimit/);
    assert.match(src, /sql_result:\s*applied\.result/);
  });
});
