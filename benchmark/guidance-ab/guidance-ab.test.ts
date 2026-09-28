import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { describe, it } from 'node:test';
import { buildSqlSystemPrompt } from '../schema-ab/prompt';
import { loadGoldCases } from '../schema-ab/dataset';
import type { ExecuteOutcome, SchemaColumn } from '../schema-ab/types';
import { loadGuidanceTemplate } from './guidance';
import { assertCleanDenominator, evaluateKillLine, killLineRule } from './kill-line';
import {
  GOLD_AMBIGUOUS_IDS,
  GUIDANCE_TEMPLATE_REPO_PATH,
  GUIDANCE_TEMPLATE_VERSION,
  LLM_NOISE_IDS,
  TARGET_AGG_FILTER_GRAIN_IDS,
} from './pinned';
import { buildGuidanceAbSystemPrompt } from './prompt';
import { buildReport, renderReportMarkdown, writeReport } from './report';
import { runGuidanceAb } from './runner';
import type { ArmItemResult, GuidanceAbItem, LoadedGuidance } from './types';

const columns: SchemaColumn[] = [
  { table_name: 'orders', column_name: 'id', data_type: 'integer' },
  { table_name: 'orders', column_name: 'status', data_type: 'character varying' },
  { table_name: 'orders', column_name: 'total_amount', data_type: 'numeric' },
];

const datasetPath = resolve(__dirname, '../datasets/gold-20.yaml');
const goldIds = loadGoldCases(datasetPath).map((item) => item.id);

function arm(spec: { pass?: boolean; error?: string | null } = {}): ArmItemResult {
  const error = spec.error ?? null;
  const pass = Boolean(spec.pass) && error == null;
  return {
    pass,
    exec_at_1: error == null,
    sql_value_match: pass,
    outcome: error ? 'error' : 'ok',
    write_reject: false,
    timeout: false,
    generated_sql: pass ? 'SELECT 1 AS value' : '',
    error,
  };
}

function fixture(
  specs: Record<string, { dump?: { pass?: boolean; error?: string | null }; guidance?: { pass?: boolean; error?: string | null } }> = {},
): GuidanceAbItem[] {
  return goldIds.map((id) => {
    const spec = specs[id] ?? {};
    return {
      id,
      level: id.includes('-L2-') ? 'L2' : 'L1',
      question: id,
      exclusion: null,
      primary_included: false,
      target_set: false,
      arms: {
        'schema-dump': arm(spec.dump),
        guidance: arm(spec.guidance),
      },
    };
  });
}

function reportFor(
  items: GuidanceAbItem[],
  options: { dryRun?: boolean; fullDataset?: boolean } = {},
) {
  return buildReport({
    dryRun: options.dryRun ?? false,
    fullDataset: options.fullDataset ?? true,
    llmModel: 'unit-test-model',
    dataset: 'benchmark/datasets/gold-20.yaml',
    gitSha: 'abc123',
    ffpSqlSandbox: '0.1.5',
    startedAt: '2026-09-24T00:00:00.000Z',
    finishedAt: '2026-09-24T00:00:01.000Z',
    schemaDump: 'orders\n  id integer',
    guidance: {
      version: GUIDANCE_TEMPLATE_VERSION,
      path: GUIDANCE_TEMPLATE_REPO_PATH,
      sha256: 'deadbeef',
      body: 'fixture-guidance',
    },
    prompts: {
      'schema-dump': 'dump-prompt',
      guidance: 'dump-prompt\n\nfixture-guidance\n',
    },
    items,
  });
}

describe('pinned gold-20 ids', () => {
  it('keeps noise, gold-ambiguous, and the target 8 inside the dataset and disjoint', () => {
    const ids = new Set(goldIds);
    assert.equal(goldIds.length, 20);
    for (const id of [...LLM_NOISE_IDS, ...GOLD_AMBIGUOUS_IDS, ...TARGET_AGG_FILTER_GRAIN_IDS]) {
      assert.equal(ids.has(id), true, id);
    }
    const noise = new Set<string>(LLM_NOISE_IDS);
    const ambiguous = new Set<string>(GOLD_AMBIGUOUS_IDS);
    const target = new Set<string>(TARGET_AGG_FILTER_GRAIN_IDS);
    for (const id of noise) {
      assert.equal(ambiguous.has(id), false);
      assert.equal(target.has(id), false);
    }
    for (const id of ambiguous) assert.equal(target.has(id), false);
    assert.equal(TARGET_AGG_FILTER_GRAIN_IDS.length, 8);
    assert.deepEqual([...LLM_NOISE_IDS], [
      'BI-L2-002',
      'BI-L2-003',
      'BI-L2-004',
      'BI-L2-005',
      'BI-L2-006',
    ]);
    assert.deepEqual([...GOLD_AMBIGUOUS_IDS], ['BI-L1-006', 'BI-L1-011']);
  });
});

describe('frozen guidance template', () => {
  it('loads the committed file, version, and checksum', () => {
    const loaded = loadGuidanceTemplate();
    assert.equal(loaded.version, GUIDANCE_TEMPLATE_VERSION);
    assert.equal(loaded.path, GUIDANCE_TEMPLATE_REPO_PATH);
    assert.equal(loaded.sha256, '695a996e61449456d456e73354f46bfc4c174fd454d10c5bb6f0ce959e1ce762');
    assert.match(loaded.body, /orders\.status = 'completed'/);
    assert.match(loaded.body, /daily_metrics/);
    assert.match(loaded.body, /零填充/);
    assert.match(loaded.body, /SUM\(amount\) \/ COUNT\(orders\)/);
    assert.match(loaded.body, /COUNT\(DISTINCT user_id\)/);
    assert.match(loaded.body, /不要增加会改变粒度的多余连接/);
    const cli = readFileSync(resolve(__dirname, 'cli.ts'), 'utf8');
    const runner = readFileSync(resolve(__dirname, 'runner.ts'), 'utf8');
    assert.match(cli, /loadGuidanceTemplate\(/);
    assert.equal(cli.includes("orders.status = 'completed'"), false);
    assert.equal(runner.includes("orders.status = 'completed'"), false);
    assert.equal(runner.includes('daily_metrics'), false);
  });

  it('refuses a mid-run checksum or version edit', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'guidance-template-'));
    const filePath = resolve(dir, 'template.md');
    const original = readFileSync(resolve(__dirname, 'templates/intent-aggregation-grain-v1.md'), 'utf8');
    writeFileSync(filePath, original);
    writeFileSync(`${filePath}.sha256`, 'not-the-hash\n');
    assert.throws(() => loadGuidanceTemplate(filePath), /checksum mismatch/);
    writeFileSync(filePath, original.replace(GUIDANCE_TEMPLATE_VERSION, 'guidance-edited-mid-run'));
    writeFileSync(`${filePath}.sha256`, 'ignored\n');
    assert.throws(() => loadGuidanceTemplate(filePath), /version must be/);
  });
});

describe('prompts', () => {
  it('keeps arm A identical to schema-dump and appends the file body only on arm B', () => {
    const dump = 'orders\n  id integer\n  status character varying';
    const body = 'SENTINEL_GUIDANCE_RULE\n';
    const armA = buildGuidanceAbSystemPrompt('schema-dump', dump, body);
    const armB = buildGuidanceAbSystemPrompt('guidance', dump, body);
    assert.equal(armA, buildSqlSystemPrompt('schema-dump', dump));
    assert.equal(armA.includes('SENTINEL_GUIDANCE_RULE'), false);
    assert.equal(armB.startsWith(armA), true);
    assert.equal(armB.includes('SENTINEL_GUIDANCE_RULE'), true);
    assert.throws(() => buildGuidanceAbSystemPrompt('guidance', dump, '  \n'), /empty/);
  });
});

describe('kill line denominator', () => {
  it('rejects a dirty denominator of 20 and scores clean N', () => {
    assert.throws(() => assertCleanDenominator(20, 20, 2), /dirty denominator 20/);
    assert.equal(killLineRule().includes('/20'), false);
    assert.match(killLineRule(), /\+3\/N/);
    assert.match(killLineRule(), /\+3\/8/);

    const cleared = reportFor(
      fixture({
        'BI-L1-001': { guidance: { pass: true } },
        'BI-L1-002': { guidance: { pass: true } },
        'BI-L1-003': { guidance: { pass: true } },
        'BI-L1-006': { dump: { pass: true } },
        'BI-L2-002': { dump: { error: 'llm: This operation was aborted' } },
        'BI-L2-003': {
          dump: { error: 'llm: fetch failed' },
          guidance: { error: 'llm: fetch failed' },
        },
        'BI-L2-004': {
          dump: { error: 'llm: fetch failed' },
          guidance: { error: 'llm: fetch failed' },
        },
        'BI-L2-005': {
          dump: { error: 'llm: fetch failed' },
          guidance: { error: 'llm: fetch failed' },
        },
        'BI-L2-006': {
          dump: { error: 'llm: fetch failed' },
          guidance: { error: 'llm: fetch failed' },
        },
      }),
    );

    assert.equal(cleared.items.length, 20);
    assert.equal(cleared.kill_line.primary.denominator, 13);
    assert.notEqual(cleared.kill_line.primary.denominator, 20);
    assert.equal(cleared.delta, 3);
    assert.equal(cleared.kill_line.primary.guidance_pass, 3);
    assert.equal(cleared.kill_line.primary.schema_dump_pass, 0);
    assert.equal(cleared.arms.guidance.pass - cleared.arms['schema-dump'].pass, 2);
    assert.equal(cleared.kill_line.secondary.observed_delta, 3);
    assert.equal(cleared.kill_line.secondary.denominator, 8);
    assert.equal(cleared.kill_line.decision, 'clear');
    assert.equal(cleared.kill_line.met, true);
    assert.deepEqual(cleared.kill_line.primary.excluded_gold_ambiguous, ['BI-L1-006', 'BI-L1-011']);
    assert.deepEqual(cleared.kill_line.primary.excluded_unrecovered_llm_noise, [...LLM_NOISE_IDS]);

    const markdown = renderReportMarkdown(cleared);
    assert.doesNotMatch(cleared.kill_line.rule, /\/20\b/);
    assert.doesNotMatch(markdown, /\+\d+\/20\b/);
    assert.match(markdown, /Primary N = 13/);
    assert.match(markdown, /\+3\/13/);
    assert.match(markdown, /SHA256: `deadbeef`/);
  });

  it('drops gold-ambiguous passes from N even when every transport call succeeded', () => {
    const report = reportFor(
      fixture({
        'BI-L1-006': { dump: { pass: true }, guidance: { pass: true } },
        'BI-L1-011': { guidance: { pass: true } },
      }),
    );
    assert.equal(report.kill_line.primary.denominator, 18);
    assert.notEqual(report.kill_line.primary.denominator, report.items.length);
    assert.equal(report.kill_line.primary.observed_delta, 0);
    assert.equal(report.kill_line.primary.guidance_pass, 0);
    assert.equal(report.arms.guidance.pass, 2);
    assert.equal(report.kill_line.decision, 'kill');
  });

  it('kills when either the primary or the target-8 delta misses', () => {
    const primaryMiss = reportFor(
      fixture({
        'BI-L1-001': { guidance: { pass: true } },
        'BI-L1-002': { guidance: { pass: true } },
        'BI-L1-003': { guidance: { pass: true } },
        'BI-L1-005': { dump: { pass: true } },
        'BI-L1-007': { dump: { pass: true } },
      }),
    );
    assert.equal(primaryMiss.kill_line.primary.observed_delta, 1);
    assert.equal(primaryMiss.kill_line.secondary.observed_delta, 3);
    assert.equal(primaryMiss.kill_line.primary.met, false);
    assert.equal(primaryMiss.kill_line.secondary.met, true);
    assert.equal(primaryMiss.kill_line.decision, 'kill');

    const secondaryMiss = reportFor(
      fixture({
        'BI-L1-005': { guidance: { pass: true } },
        'BI-L1-007': { guidance: { pass: true } },
        'BI-L1-010': { guidance: { pass: true } },
      }),
    );
    assert.equal(secondaryMiss.kill_line.primary.denominator, 18);
    assert.equal(secondaryMiss.kill_line.primary.observed_delta, 3);
    assert.equal(secondaryMiss.kill_line.secondary.observed_delta, 0);
    assert.equal(secondaryMiss.kill_line.decision, 'kill');
  });

  it('counts a recovered noise id and leaves an unrecovered abort out of N', () => {
    const recovered = reportFor(
      fixture({
        'BI-L2-002': {
          dump: { error: 'column "region" does not exist' },
          guidance: { pass: true },
        },
      }),
    );
    assert.equal(recovered.kill_line.primary.denominator, 18);
    assert.equal(recovered.kill_line.primary.excluded_unrecovered_llm_noise.length, 0);
    assert.equal(recovered.kill_line.primary.guidance_pass, 1);
    assert.equal(recovered.items.find((item) => item.id === 'BI-L2-002')?.primary_included, true);

    const aborted = reportFor(
      fixture({
        'BI-L2-008': {
          dump: { pass: true },
          guidance: { error: 'llm: This operation was aborted' },
        },
        'BI-L1-001': { guidance: { pass: true } },
        'BI-L1-002': { guidance: { pass: true } },
        'BI-L1-003': { guidance: { pass: true } },
        'BI-L1-004': { guidance: { pass: true } },
      }),
    );
    assert.equal(aborted.kill_line.decision, 'incomplete');
    assert.equal(aborted.kill_line.applicable, false);
    assert.deepEqual(aborted.kill_line.secondary.blocked_unrecovered_llm_noise, ['BI-L2-008']);
    assert.equal(aborted.kill_line.primary.schema_dump_pass, 0);
    assert.equal(aborted.items.find((item) => item.id === 'BI-L2-008')?.exclusion, 'unrecovered-llm-noise');
  });

  it('does not judge a dry run or a subset', () => {
    const items = fixture({
      'BI-L1-001': { guidance: { pass: true } },
      'BI-L1-002': { guidance: { pass: true } },
      'BI-L1-003': { guidance: { pass: true } },
    });
    const dry = reportFor(items, { dryRun: true, fullDataset: true });
    assert.equal(dry.kill_line.decision, 'incomplete');
    assert.equal(dry.kill_line.met, false);
    const subset = reportFor(items.slice(0, 4), { fullDataset: false });
    assert.equal(subset.kill_line.decision, 'incomplete');
    assert.equal(subset.kill_line.primary.denominator, 4);
  });
});

describe('runGuidanceAb', () => {
  const guidance: LoadedGuidance = {
    version: GUIDANCE_TEMPLATE_VERSION,
    path: GUIDANCE_TEMPLATE_REPO_PATH,
    sha256: 'abc',
    body: 'SENTINEL_GUIDANCE_BODY',
  };

  it('loads guidance only into arm B and writes the report shape', async () => {
    const seen: string[] = [];
    const report = await runGuidanceAb({
      cases: [
        {
          id: 'BI-L1-001',
          level: 'L1',
          question: '最近 30 天',
          gold_sql: 'SELECT 1 AS value',
        },
      ],
      columns,
      guidance,
      model: 'unit-test-model',
      datasetPath: datasetPath,
      gitSha: 'abc123',
      ffpSqlSandbox: '0.1.5',
      dryRun: false,
      fullDataset: false,
      startedAt: '2026-09-24T00:00:00.000Z',
      finishedAt: () => '2026-09-24T00:00:01.000Z',
      generateSql: async (request) => {
        seen.push(`${request.arm}:${request.caseId}`);
        assert.equal(request.user, '问题：最近 30 天');
        if (request.arm === 'schema-dump') {
          assert.equal(request.system.includes('SENTINEL_GUIDANCE_BODY'), false);
          assert.equal(request.system.includes('status character varying'), true);
          return 'DELETE FROM orders';
        }
        assert.equal(request.system.includes('SENTINEL_GUIDANCE_BODY'), true);
        assert.equal(request.system.includes('status character varying'), true);
        return 'SELECT 1 AS value';
      },
      executeSql: async (sql): Promise<ExecuteOutcome> => {
        if (sql.startsWith('DELETE')) return { kind: 'write_reject', error: 'NOT_READ_ONLY_PREFIX' };
        return { kind: 'ok', result: { columns: ['value'], rows: [{ value: 1 }], rowCount: 1 } };
      },
      executeGoldSql: async () => ({ columns: ['value'], rows: [{ value: 1 }], rowCount: 1 }),
    });

    assert.deepEqual(seen, ['schema-dump:BI-L1-001', 'guidance:BI-L1-001']);
    assert.equal(report.guidance.sha256, 'abc');
    assert.equal(report.guidance.path, GUIDANCE_TEMPLATE_REPO_PATH);
    assert.equal(report.items[0].arms['schema-dump'].pass, false);
    assert.equal(report.items[0].arms['schema-dump'].write_reject, true);
    assert.equal(report.items[0].arms.guidance.pass, true);
    assert.equal(report.kill_line.decision, 'incomplete');
    assert.equal(report.prompts.guidance.includes('SENTINEL_GUIDANCE_BODY'), true);
    assert.equal(report.prompts['schema-dump'].includes('SENTINEL_GUIDANCE_BODY'), false);

    const dir = writeReport(report, mkdtempSync(resolve(tmpdir(), 'guidance-ab-')));
    const saved = JSON.parse(readFileSync(resolve(dir, 'report.json'), 'utf8')) as { experiment: string };
    assert.equal(saved.experiment, 'guidance-ab');
    assert.equal(readFileSync(resolve(dir, 'report.md'), 'utf8'), renderReportMarkdown(report));
  });

  it('skips the model when gold SQL fails', async () => {
    let calls = 0;
    const report = await runGuidanceAb({
      cases: [
        { id: 'BI-L1-004', level: 'L1', question: 'q', gold_sql: 'SELECT 1' },
      ],
      columns,
      guidance,
      model: 'm',
      datasetPath,
      gitSha: 'sha',
      ffpSqlSandbox: '0.1.5',
      dryRun: true,
      fullDataset: false,
      startedAt: 't0',
      finishedAt: () => 't1',
      generateSql: async () => {
        calls += 1;
        return 'SELECT 1';
      },
      executeSql: async () => ({ kind: 'ok', result: { columns: ['value'], rows: [{ value: 1 }], rowCount: 1 } }),
      executeGoldSql: async () => {
        throw new Error('relation missing');
      },
    });
    assert.equal(calls, 0);
    assert.match(report.items[0].arms['schema-dump'].error ?? '', /gold SQL failed/);
    assert.equal(report.kill_line.met, false);
  });
});

describe('evaluateKillLine direct', () => {
  it('uses the same clean N as the report', () => {
    const items = fixture();
    const line = evaluateKillLine({ items, dryRun: false, fullDataset: true });
    assert.equal(line.primary.denominator, 18);
    assert.equal(line.decision, 'kill');
  });
});
