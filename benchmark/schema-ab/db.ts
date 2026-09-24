import { Client } from 'pg';
import type { QueryResult } from '@ai-bi/shared';
import { classifyPgError, classifyValidation, type SqlValidation } from './outcome';
import { loadSchemaColumns, type SchemaQueryClient } from './schema-dump';
import type { ExecuteOutcome, SchemaColumn } from './types';

export interface SqlClient {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; fields?: { name: string }[] }>;
}

export function createBenchmarkClient(env: NodeJS.ProcessEnv = process.env): Client {
  return new Client({
    host: env.BENCHMARK_DB_HOST ?? 'localhost',
    port: Number.parseInt(env.BENCHMARK_DB_PORT ?? '5433', 10),
    user: env.BENCHMARK_DB_USER ?? 'postgres',
    password: env.BENCHMARK_DB_PASSWORD ?? 'password',
    database: env.BENCHMARK_DB_NAME ?? 'benchmark_bi',
  });
}

function toQueryResult(result: {
  rows: Record<string, unknown>[];
  fields?: { name: string }[];
}): QueryResult {
  const columns = (result.fields ?? []).map((field) => field.name);
  return { columns, rows: result.rows, rowCount: result.rows.length };
}

/**
 * Extended protocol (empty params array) rejects multi-statement SQL.
 * The transaction is read-only so a write that passes validation still cannot commit.
 */
async function runReadOnly(
  client: SqlClient,
  sql: string,
  timeoutMs: number,
): Promise<ExecuteOutcome> {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query('SELECT set_config($1, $2, true)', [
      'statement_timeout',
      String(timeoutMs),
    ]);
    const result = await client.query(sql, []);
    return { kind: 'ok', result: toQueryResult(result) };
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    const kind = classifyPgError(pgErr);
    return { kind, error: pgErr.message ?? 'query failed' };
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
  }
}

export async function executeCandidateSql(params: {
  sql: string;
  timeoutMs: number;
  client: SqlClient;
  validate: (sql: string) => Promise<SqlValidation>;
}): Promise<ExecuteOutcome> {
  const validation = await params.validate(params.sql);
  const rejected = classifyValidation(validation);
  if (rejected) {
    const reason = validation.ok ? rejected : `${validation.code}: ${validation.reason}`;
    return { kind: rejected, error: reason };
  }
  return runReadOnly(params.client, params.sql, params.timeoutMs);
}

export async function executeGoldSql(
  client: SqlClient,
  sql: string,
  timeoutMs: number,
): Promise<QueryResult> {
  const outcome = await runReadOnly(client, sql, timeoutMs);
  if (outcome.kind !== 'ok') {
    throw new Error(outcome.error);
  }
  return outcome.result;
}

export async function readBenchmarkCatalog(
  client: SchemaQueryClient,
): Promise<SchemaColumn[]> {
  return loadSchemaColumns(client);
}
