import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateSql } from '../../apps/api/src/sandbox/ffp-client';
import {
  createBenchmarkClient,
  executeCandidateSql,
  executeGoldSql as runGoldSql,
  readBenchmarkCatalog,
} from './db';
import { loadGoldCases, selectCases } from './dataset';
import { generateSqlWithLlm } from './llm';
import { writeReport } from './report';
import { runSchemaAb, type GenerateSqlRequest } from './runner';
import type { ExecuteOutcome, SchemaColumn } from './types';

const ROOT = resolve(__dirname, '../..');

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq);
      const val = trimmed.slice(eq + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // optional file
  }
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const caseIds: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      if (key === 'id' || key === 'case') {
        caseIds.push(
          ...next
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
        );
      } else {
        args[key] = next;
      }
      i++;
    } else {
      args[key] = 'true';
    }
  }
  return { args, caseIds };
}

function printUsage() {
  console.log(`Usage: pnpm benchmark:schema-ab -- [options]

Options:
  --dry-run            Stub both arms. No LLM calls and no benchmark DB.
  --id, --case <ids>   Case ids (comma-separated or repeatable)
  --limit <n>          Cap the number of cases
  --dataset <path>     Dataset yaml (default benchmark/datasets/gold-20.yaml)
  --output <path>      Report directory
  --model <name>       Override LLM_MODEL (recorded before the run)

Live run env:
  LLM_MODEL            Required. Printed and stored before any item runs.
  LLM_API_KEY          Required.
  LLM_API_BASE         Optional. Default https://api.openai.com/v1
  BENCHMARK_DB_HOST    Default localhost
  BENCHMARK_DB_PORT    Default 5433
  BENCHMARK_DB_USER    Default postgres
  BENCHMARK_DB_PASSWORD Default password
  BENCHMARK_DB_NAME    Default benchmark_bi
  SCHEMA_AB_STATEMENT_TIMEOUT_MS  Default 15000
  SCHEMA_AB_LLM_TIMEOUT_MS        Default 60000
`);
}

function gitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function ffpVersion(): string {
  const pkg = JSON.parse(
    readFileSync(resolve(ROOT, 'apps/api/package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  return pkg.dependencies?.['ffp-sql-sandbox'] ?? 'unknown';
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const DRY_COLUMNS: SchemaColumn[] = [
  { table_name: 'orders', column_name: 'id', data_type: 'integer' },
  { table_name: 'orders', column_name: 'total_amount', data_type: 'numeric' },
];

async function main() {
  loadEnvFile(resolve(ROOT, '.env'));
  loadEnvFile(resolve(ROOT, 'benchmark/.env.benchmark'));

  const { args, caseIds } = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const dryRun = args['dry-run'] === 'true';
  if (args.model) process.env.LLM_MODEL = args.model;
  const model = process.env.LLM_MODEL ?? '';
  if (!dryRun && !model) {
    console.error('LLM_MODEL is required. Set it before the run.');
    process.exit(1);
  }
  if (!dryRun && !process.env.LLM_API_KEY) {
    console.error('LLM_API_KEY is required.');
    process.exit(1);
  }

  const recordedModel = model || 'dry-run';
  console.log(`LLM_MODEL=${recordedModel}`);

  const datasetPath = resolve(
    args.dataset ?? resolve(ROOT, 'benchmark/datasets/gold-20.yaml'),
  );
  const cases = selectCases(loadGoldCases(datasetPath), {
    caseIds: caseIds.length ? caseIds : undefined,
    limit: args.limit ? Number.parseInt(args.limit, 10) : undefined,
  });
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const outputDir =
    args.output ?? resolve(ROOT, 'benchmark/reports/schema-ab', dryRun ? `dry-run-${stamp}` : stamp);

  const timeoutMs = intEnv('SCHEMA_AB_STATEMENT_TIMEOUT_MS', 15_000);
  const llmTimeoutMs = intEnv('SCHEMA_AB_LLM_TIMEOUT_MS', 60_000);

  let columns: SchemaColumn[] = DRY_COLUMNS;
  let executeSql: (sql: string) => Promise<ExecuteOutcome>;
  let executeGoldSql: (sql: string) => Promise<{
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
  }>;
  let generateSql: (request: GenerateSqlRequest) => Promise<string>;
  let liveClient: ReturnType<typeof createBenchmarkClient> | undefined;

  try {
    if (dryRun) {
      generateSql = async (request) =>
        request.arm === 'schema-dump' ? 'SELECT 1 AS value' : 'DELETE FROM orders';
      executeSql = async (sql) => {
        if (/^\s*(delete|insert|update|drop|alter|truncate)\b/i.test(sql)) {
          return { kind: 'write_reject', error: 'NOT_READ_ONLY_PREFIX: dry-run stub' };
        }
        return {
          kind: 'ok',
          result: { columns: ['value'], rows: [{ value: 1 }], rowCount: 1 },
        };
      };
      executeGoldSql = async () => ({
        columns: ['value'],
        rows: [{ value: 1 }],
        rowCount: 1,
      });
    } else {
      liveClient = createBenchmarkClient();
      await liveClient.connect();
      columns = await readBenchmarkCatalog(liveClient);
      const tableCount = new Set(columns.map((col) => col.table_name)).size;
      console.log(`Schema dump tables: ${tableCount}`);
      if (columns.length === 0) {
        console.warn(
          'Schema catalog is empty. Seed the benchmark database before treating this run as evidence.',
        );
      }
      const client = liveClient;
      executeSql = (sql) =>
        executeCandidateSql({ sql, timeoutMs, client, validate: validateSql });
      executeGoldSql = (sql) => runGoldSql(client, sql, timeoutMs);
      const apiKey = process.env.LLM_API_KEY ?? '';
      const apiBase = process.env.LLM_API_BASE ?? 'https://api.openai.com/v1';
      generateSql = (request) =>
        generateSqlWithLlm({
          model: recordedModel,
          apiKey,
          apiBase,
          system: request.system,
          user: request.user,
          timeoutMs: llmTimeoutMs,
        });
    }

    const report = await runSchemaAb({
      cases,
      columns,
      model: recordedModel,
      datasetPath,
      gitSha: gitSha(),
      ffpSqlSandbox: ffpVersion(),
      dryRun,
      startedAt,
      finishedAt: () => new Date().toISOString(),
      generateSql,
      executeSql,
      executeGoldSql,
    });
    const dir = writeReport(report, outputDir);
    console.log(
      `delta=${report.delta} schema-dump=${report.arms['schema-dump'].pass}/${report.arms['schema-dump'].total} no-schema=${report.arms['no-schema'].pass}/${report.arms['no-schema'].total}`,
    );
    console.log(`kill_line_met=${report.kill_line.met} applicable=${report.kill_line.applicable}`);
    console.log(`report=${dir}`);
  } finally {
    await liveClient?.end();
  }
}

const isDirect =
  process.argv[1] != null && resolve(process.argv[1]) === resolve(__filename);
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
