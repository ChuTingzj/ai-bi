import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client as PgClient } from 'pg';
import { parse as parseYaml } from 'yaml';
import type { AgentService } from '../agent/agent.service';
import type { QueryResult } from '@ai-bi/shared';
import { scoreAnalyst } from './scorers/analyst.scorer';
import { scoreChart } from './scorers/chart.scorer';
import { scoreIntent } from './scorers/intent.scorer';
import { scoreSql } from './scorers/sql.scorer';
import { buildSummary, writeReport } from './report';
import type {
  CachedGoldResult,
  CaseResult,
  CaseScores,
  GoldCase,
  GoldDataset,
} from './types';

export interface RunnerOptions {
  datasetPath: string;
  dataSourceId: string;
  userId: string;
  sessionId: string;
  outputDir: string;
  model?: string;
  levelFilter?: string;
  caseIds?: string[];
  limit?: number;
  dbHost?: string;
  dbPort?: number;
}

async function executeGoldSql(
  sql: string,
  host: string,
  port: number,
): Promise<QueryResult> {
  const client = new PgClient({
    host,
    port,
    user: 'postgres',
    password: 'password',
    database: 'benchmark_bi',
  });
  await client.connect();
  const result = await client.query(sql);
  await client.end();

  const columns = result.fields.map((f) => f.name);
  const rows = result.rows as Record<string, unknown>[];
  return { columns, rows, rowCount: rows.length };
}

async function cacheGoldResults(
  cases: GoldCase[],
  host: string,
  port: number,
): Promise<Map<string, CachedGoldResult>> {
  const cache = new Map<string, CachedGoldResult>();
  for (const c of cases) {
    try {
      const result = await executeGoldSql(c.gold_sql, host, port);
      cache.set(c.id, result);
    } catch (err) {
      console.warn(`Failed to cache gold SQL for ${c.id}: ${(err as Error).message}`);
    }
  }
  return cache;
}

function scoreCase(
  goldCase: GoldCase,
  run: Awaited<ReturnType<AgentService['runBenchmarkCase']>>,
  goldResult: CachedGoldResult | undefined,
): CaseResult {
  const intentScore = scoreIntent(
    run.intent,
    run.relevant_tables,
    goldCase,
  );

  const sqlScore = scoreSql({
    sql_attempts: run.sql_attempts,
    sql_result: run.sql_result,
    sql_error: run.sql_error,
    fallback: run.fallback,
    gold_result: goldResult ?? null,
    numeric_tolerance: goldCase.result_tolerance?.numeric_tolerance,
  });

  const chart_valid = scoreChart(run.chart_config);
  const analyst_keyword_coverage = scoreAnalyst(
    run.analyst_text,
    goldCase.analyst_keywords,
  );

  const e2e_success =
    sqlScore.sql_at_3 &&
    chart_valid &&
    run.analyst_text.trim().length > 0 &&
    !run.fallback;

  const scores: CaseScores = {
    intent_table_recall: intentScore.table_recall,
    chart_type_match: intentScore.chart_type_match,
    sql_at_1: sqlScore.sql_at_1,
    sql_at_3: sqlScore.sql_at_3,
    sql_result_match: sqlScore.sql_result_match,
    chart_valid,
    analyst_keyword_coverage,
    e2e_success,
    fallback: run.fallback,
  };

  let failure_reason: string | undefined;
  if (run.fallback) {
    failure_reason = `fallback after ${run.error_count} errors: ${run.sql_error}`;
  } else if (!sqlScore.sql_at_3) {
    failure_reason = run.sql_error ?? 'SQL result mismatch';
  } else if (!chart_valid) {
    failure_reason = 'Invalid chart config';
  } else if (!run.analyst_text.trim()) {
    failure_reason = 'Empty analyst output';
  }

  return {
    case_id: goldCase.id,
    level: goldCase.level,
    question: goldCase.question,
    run,
    gold_row_count: goldResult?.rowCount ?? null,
    scores,
    failure_reason,
  };
}

export async function runBenchmark(
  agentService: AgentService,
  options: RunnerOptions,
): Promise<string> {
  const datasetContent = readFileSync(resolve(options.datasetPath), 'utf-8');
  const dataset = parseYaml(datasetContent) as GoldDataset;

  let cases = dataset.cases;
  if (options.caseIds?.length) {
    const byId = new Map(cases.map((c) => [c.id, c]));
    const unknown = options.caseIds.filter((id) => !byId.has(id));
    if (unknown.length) {
      throw new Error(
        `Unknown case id(s): ${unknown.join(', ')}. Available: ${cases.map((c) => c.id).join(', ')}`,
      );
    }
    cases = options.caseIds.map((id) => byId.get(id)!);
  }
  if (options.levelFilter) {
    cases = cases.filter((c) => c.level === options.levelFilter);
  }
  if (options.limit && options.limit > 0) {
    cases = cases.slice(0, options.limit);
  }
  if (cases.length === 0) {
    throw new Error('No cases matched the given filters.');
  }

  const dbHost = options.dbHost ?? 'localhost';
  const dbPort = options.dbPort ?? 5433;

  console.log(`Caching gold results for ${cases.length} cases...`);
  const goldCache = await cacheGoldResults(cases, dbHost, dbPort);

  const results: CaseResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const goldCase = cases[i];
    console.log(`[${i + 1}/${cases.length}] Running ${goldCase.id}: ${goldCase.question}`);

    try {
      const run = await agentService.runBenchmarkCase({
        sessionId: options.sessionId,
        question: goldCase.question,
        dataSourceId: options.dataSourceId,
        userId: options.userId,
      });

      const caseResult = scoreCase(
        goldCase,
        run,
        goldCache.get(goldCase.id),
      );
      results.push(caseResult);

      const status = caseResult.scores.e2e_success ? 'PASS' : 'FAIL';
      console.log(
        `  → ${status} | SQL@1=${caseResult.scores.sql_at_1} SQL@3=${caseResult.scores.sql_at_3} | ${run.total_latency_ms}ms`,
      );
    } catch (err) {
      console.error(`  → ERROR: ${(err as Error).message}`);
      results.push({
        case_id: goldCase.id,
        level: goldCase.level,
        question: goldCase.question,
        run: {
          intent: null,
          relevant_tables: [],
          generated_sql: '',
          sql_result: null,
          sql_error: (err as Error).message,
          error_count: 0,
          chart_config: null,
          analyst_text: '',
          fallback: true,
          sql_attempts: 0,
          latencies_ms: {},
          total_latency_ms: 0,
        },
        gold_row_count: goldCache.get(goldCase.id)?.rowCount ?? null,
        scores: {
          intent_table_recall: 0,
          chart_type_match: false,
          sql_at_1: false,
          sql_at_3: false,
          sql_result_match: false,
          chart_valid: false,
          analyst_keyword_coverage: 0,
          e2e_success: false,
          fallback: true,
        },
        failure_reason: (err as Error).message,
      });
    }
  }

  const summary = buildSummary({
    model: options.model ?? process.env.LLM_MODEL ?? 'unknown',
    dataset: options.datasetPath,
    cases: results,
  });

  writeReport(summary, resolve(options.outputDir));
  return summary.recommendation;
}
