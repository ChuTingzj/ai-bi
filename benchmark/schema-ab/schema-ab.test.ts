import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { describe, it } from 'node:test';
import { SQL_SYSTEM_PROMPT } from '../../apps/api/src/agent/graph/prompts';
import { validateSql } from '../../apps/api/src/sandbox/ffp-client';
import { loadGoldCases, selectCases } from './dataset';
import { executeCandidateSql, type SqlClient } from './db';
import { stripCodeFence } from './llm';
import { classifyPgError, classifyValidation } from './outcome';
import { buildSqlSystemPrompt, buildSqlUserPrompt } from './prompt';
import { buildReport, renderReportMarkdown, writeReport } from './report';
import { runSchemaAb } from './runner';
import { scoreCandidate } from './score';
import { formatSchemaDump, loadSchemaColumns, SCHEMA_COLUMNS_SQL } from './schema-dump';
import type { ExecuteOutcome, SchemaAbCase, SchemaColumn } from './types';

const columns: SchemaColumn[] = [
  { table_name: 'orders', column_name: 'id', data_type: 'integer' },
  { table_name: 'orders', column_name: 'status', data_type: 'character varying' },
  { table_name: 'users', column_name: 'email', data_type: 'character varying' },
];

function goldResult() {
  return {
    columns: ['value'],
    rows: [{ value: 1 }],
    rowCount: 1,
  };
}

describe('gold-20 dataset', () => {
  it('loads 12 L1 and 8 L2 cases with question, gold_sql, and id', () => {
    const cases = loadGoldCases(resolve(__dirname, '../datasets/gold-20.yaml'));
    assert.equal(cases.length, 20);
    assert.equal(cases.filter((item) => item.level === 'L1').length, 12);
    assert.equal(cases.filter((item) => item.level === 'L2').length, 8);
    for (const item of cases) {
      assert.ok(item.id);
      assert.ok(item.question);
      assert.ok(item.gold_sql.length > 0);
    }
  });

  it('selects by id and rejects unknown ids', () => {
    const cases = loadGoldCases(resolve(__dirname, '../datasets/gold-20.yaml'));
    const selected = selectCases(cases, { caseIds: ['BI-L1-001'], limit: 5 });
    assert.deepEqual(selected.map((item) => item.id), ['BI-L1-001']);
    assert.throws(() => selectCases(cases, { caseIds: ['NO-SUCH'] }), /Unknown case id/);
  });
});

describe('schema dump', () => {
  it('formats table, column, and type only', async () => {
    const seen: string[] = [];
    const loaded = await loadSchemaColumns({
      query: async (sql) => {
        seen.push(sql);
        return { rows: columns };
      },
    });
    const dump = formatSchemaDump(loaded);
    assert.match(seen[0], /information_schema\.columns/);
    assert.match(SCHEMA_COLUMNS_SQL, /data_type/);
    assert.equal(
      dump,
      'orders\n  id integer\n  status character varying\nusers\n  email character varying',
    );
    assert.equal(dump.includes('NOT NULL'), false);
    assert.equal(dump.includes('example.com'), false);
  });
});

describe('prompts', () => {
  it('shares the production SQL prompt and differs only by the schema slot', () => {
    const dump = formatSchemaDump(columns);
    const bare = buildSqlSystemPrompt('no-schema', dump);
    const grounded = buildSqlSystemPrompt('schema-dump', dump);
    assert.equal(bare.includes('{dialect}'), false);
    assert.equal(bare.includes('{table_schema}'), false);
    assert.equal(bare.includes('PostgreSQL'), true);
    assert.equal(bare.includes('orders'), false);
    assert.equal(grounded.includes('  id integer'), true);
    assert.equal(grounded.replace(dump, ''), bare);
    assert.equal(bare.includes('禁止任何 DML/DDL'), true);
    assert.equal(SQL_SYSTEM_PROMPT.includes('禁止任何 DML/DDL'), true);
    assert.equal(buildSqlUserPrompt('hi'), '问题：hi');
    assert.equal(buildSqlUserPrompt('最近 30 天').includes('orders'), false);
  });
});

describe('scoreCandidate', () => {
  it('passes only when exec@1 and sql_value_match are both true', () => {
    const gold = goldResult();
    const hit = scoreCandidate({
      outcome: { kind: 'ok', result: gold },
      gold,
    });
    assert.equal(hit.pass, true);
    assert.equal(hit.exec_at_1, true);

    const mismatch = scoreCandidate({
      outcome: { kind: 'ok', result: { columns: ['value'], rows: [{ value: 9 }], rowCount: 1 } },
      gold,
    });
    assert.equal(mismatch.exec_at_1, true);
    assert.equal(mismatch.sql_value_match, false);
    assert.equal(mismatch.pass, false);

    const rejected = scoreCandidate({
      outcome: { kind: 'write_reject', error: 'NOT_READ_ONLY_PREFIX' },
      gold,
    });
    assert.equal(rejected.pass, false);
    assert.equal(rejected.exec_at_1, false);
  });
});

describe('execution outcomes', () => {
  it('counts sandbox write rejects and postgres timeouts', () => {
    assert.equal(
      classifyValidation({ ok: false, code: 'NOT_READ_ONLY_PREFIX', reason: 'write' }),
      'write_reject',
    );
    assert.equal(
      classifyValidation({ ok: false, code: 'FORBIDDEN_KEYWORD', reason: 'copy' }),
      'write_reject',
    );
    assert.equal(
      classifyValidation({ ok: false, code: 'MULTI_STATEMENT', reason: 'multi' }),
      'error',
    );
    assert.equal(classifyValidation({ ok: true }), null);
    assert.equal(classifyPgError({ code: '57014', message: 'canceling statement due to statement timeout' }), 'timeout');
    assert.equal(classifyPgError({ code: '25006', message: 'cannot execute INSERT in a read-only transaction' }), 'write_reject');
  });

  it('does not execute SQL after a write reject', async () => {
    let queries = 0;
    const client: SqlClient = {
      query: async () => {
        queries += 1;
        return { rows: [], fields: [] };
      },
    };
    const outcome = await executeCandidateSql({
      sql: 'DELETE FROM orders',
      timeoutMs: 1000,
      client,
      validate: async () => ({ ok: false, code: 'NOT_READ_ONLY_PREFIX', reason: 'write' }),
    });
    assert.equal(outcome.kind, 'write_reject');
    assert.equal(queries, 0);
  });

  it('runs read-only with statement_timeout and maps timeout', async () => {
    const calls: string[] = [];
    const client: SqlClient = {
      query: async (sql) => {
        calls.push(sql);
        if (sql === 'SELECT 1') {
          const err = new Error('canceling statement due to statement timeout') as Error & {
            code?: string;
          };
          err.code = '57014';
          throw err;
        }
        return { rows: [], fields: [] };
      },
    };
    const outcome = await executeCandidateSql({
      sql: 'SELECT 1',
      timeoutMs: 1500,
      client,
      validate: async () => ({ ok: true }),
    });
    assert.equal(outcome.kind, 'timeout');
    assert.deepEqual(calls, [
      'BEGIN READ ONLY',
      'SELECT set_config($1, $2, true)',
      'SELECT 1',
      'ROLLBACK',
    ]);
  });
});

describe('ffp-sql-sandbox validateSql', () => {
  it('rejects a write before execution', async () => {
    const result = await validateSql('DELETE FROM t');
    assert.equal(classifyValidation(result), 'write_reject');
  });
});

describe('runSchemaAb', () => {
  const item = (id: string): SchemaAbCase => ({
    id,
    level: 'L1',
    question: `q-${id}`,
    gold_sql: 'SELECT 1 AS value',
    numeric_tolerance: 0,
  });

  it('runs both arms, scores with the shared scorer, and writes the report shape', async () => {
    const generated: string[] = [];
    const report = await runSchemaAb({
      cases: [item('a'), item('b')],
      columns,
      model: 'unit-test-model',
      datasetPath: 'benchmark/datasets/gold-20.yaml',
      gitSha: 'abc123',
      ffpSqlSandbox: '0.1.5',
      dryRun: false,
      startedAt: '2026-09-24T00:00:00.000Z',
      finishedAt: () => '2026-09-24T00:00:01.000Z',
      generateSql: async (request) => {
        generated.push(`${request.arm}:${request.caseId}`);
        assert.equal(request.user, `问题：${request.question}`);
        if (request.arm === 'no-schema') {
          assert.equal(request.system.includes('orders'), false);
          return 'DELETE FROM orders';
        }
        assert.equal(request.system.includes('  id integer'), true);
        return 'SELECT 1 AS value';
      },
      executeSql: async (sql): Promise<ExecuteOutcome> => {
        if (sql.startsWith('DELETE')) {
          return { kind: 'write_reject', error: 'NOT_READ_ONLY_PREFIX' };
        }
        if (sql.includes('sleep')) {
          return { kind: 'timeout', error: 'statement timeout' };
        }
        return { kind: 'ok', result: goldResult() };
      },
      executeGoldSql: async () => goldResult(),
    });

    assert.deepEqual(generated, ['no-schema:a', 'schema-dump:a', 'no-schema:b', 'schema-dump:b']);
    assert.equal(report.llm_model, 'unit-test-model');
    assert.equal(report.started_at, '2026-09-24T00:00:00.000Z');
    assert.equal(report.finished_at, '2026-09-24T00:00:01.000Z');
    assert.equal(report.arms['no-schema'].pass, 0);
    assert.equal(report.arms['no-schema'].write_reject_count, 2);
    assert.equal(report.arms['schema-dump'].pass, 2);
    assert.equal(report.delta, 2);
    assert.equal(report.kill_line.applicable, false);
    assert.equal(report.kill_line.met, false);
    assert.equal(report.items[0].arms['schema-dump'].pass, true);
    assert.equal(report.items[0].arms['no-schema'].pass, false);
    assert.equal(report.schema_dump.includes('email character varying'), true);

    const full = buildReport({
      dryRun: false,
      llmModel: 'm',
      dataset: 'gold-20.yaml',
      gitSha: 'sha',
      ffpSqlSandbox: '0.1.5',
      startedAt: report.started_at,
      finishedAt: report.finished_at,
      schemaDump: '',
      prompts: report.prompts,
      items: Array.from({ length: 20 }, (_, index) => ({
        id: `c${index}`,
        level: 'L1',
        question: 'q',
        arms: {
          'no-schema': { ...report.items[0].arms['no-schema'] },
          'schema-dump': {
            ...report.items[0].arms['schema-dump'],
            pass: index < 4,
          },
        },
      })),
    });
    assert.equal(full.delta, 4);
    assert.equal(full.kill_line.applicable, true);
    assert.equal(full.kill_line.met, true);

    const dir = writeReport(report, mkdtempSync(resolve(tmpdir(), 'schema-ab-')));
    const saved = JSON.parse(readFileSync(resolve(dir, 'report.json'), 'utf8'));
    assert.equal(saved.experiment, 'schema-grounding-ab');
    assert.equal(saved.metric, 'exec_at_1 AND sql_value_match');
    assert.equal(saved.arms['schema-dump'].timeout_count, 0);
    const markdown = readFileSync(resolve(dir, 'report.md'), 'utf8');
    assert.equal(markdown, renderReportMarkdown(report));
    assert.match(markdown, /unit-test-model/);
    assert.match(markdown, /\+4\/20/);
  });

  it('skips the model when gold SQL fails', async () => {
    let calls = 0;
    const report = await runSchemaAb({
      cases: [item('gold-fail')],
      columns,
      model: 'm',
      datasetPath: 'gold.yaml',
      gitSha: 'sha',
      ffpSqlSandbox: '0.1.5',
      dryRun: true,
      startedAt: 't0',
      finishedAt: () => 't1',
      generateSql: async () => {
        calls += 1;
        return 'SELECT 1';
      },
      executeSql: async () => ({ kind: 'ok', result: goldResult() }),
      executeGoldSql: async () => {
        throw new Error('relation missing');
      },
    });
    assert.equal(calls, 0);
    assert.equal(report.arms['no-schema'].pass, 0);
    assert.equal(report.arms['schema-dump'].pass, 0);
    assert.match(report.items[0].arms['no-schema'].error ?? '', /gold SQL failed/);
    assert.equal(report.kill_line.met, false);
  });
});

describe('stripCodeFence', () => {
  it('removes a sql fence', () => {
    assert.equal(stripCodeFence('```sql\nSELECT 1\n```'), 'SELECT 1');
  });
});
