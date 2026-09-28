import type { QueryResult } from '@ai-bi/shared';
import { formatSchemaDump } from '../schema-ab/schema-dump';
import { scoreCandidate } from '../schema-ab/score';
import type { ExecuteOutcome, SchemaAbCase, SchemaColumn } from '../schema-ab/types';
import { buildGuidanceAbSystemPrompt, buildSqlUserPrompt } from './prompt';
import { buildReport } from './report';
import {
  ARMS,
  type ArmItemResult,
  type ArmName,
  type GuidanceAbReport,
  type LoadedGuidance,
} from './types';

export interface GenerateSqlRequest {
  arm: ArmName;
  caseId: string;
  question: string;
  system: string;
  user: string;
}

export interface GuidanceAbRunInput {
  cases: SchemaAbCase[];
  columns: SchemaColumn[];
  guidance: LoadedGuidance;
  model: string;
  datasetPath: string;
  gitSha: string;
  ffpSqlSandbox: string;
  dryRun: boolean;
  fullDataset: boolean;
  startedAt: string;
  finishedAt: () => string;
  generateSql: (request: GenerateSqlRequest) => Promise<string>;
  executeSql: (sql: string) => Promise<ExecuteOutcome>;
  executeGoldSql: (sql: string) => Promise<QueryResult>;
}

function failedArm(error: string, generatedSql = ''): ArmItemResult {
  return {
    pass: false,
    exec_at_1: false,
    sql_value_match: false,
    outcome: 'error',
    write_reject: false,
    timeout: false,
    generated_sql: generatedSql,
    error,
  };
}

function armResult(params: {
  outcome: ExecuteOutcome;
  generatedSql: string;
  gold: QueryResult;
  numericTolerance?: number;
}): ArmItemResult {
  const scored = scoreCandidate({
    outcome: params.outcome,
    gold: params.gold,
    numericTolerance: params.numericTolerance,
  });
  return {
    pass: scored.pass,
    exec_at_1: scored.exec_at_1,
    sql_value_match: scored.sql_value_match,
    outcome: params.outcome.kind,
    write_reject: params.outcome.kind === 'write_reject',
    timeout: params.outcome.kind === 'timeout',
    generated_sql: params.generatedSql,
    error: params.outcome.kind === 'ok' ? null : params.outcome.error,
  };
}

async function runArm(params: {
  arm: ArmName;
  item: SchemaAbCase;
  schemaDump: string;
  guidanceBody: string;
  gold: QueryResult;
  generateSql: GuidanceAbRunInput['generateSql'];
  executeSql: GuidanceAbRunInput['executeSql'];
}): Promise<ArmItemResult> {
  const system = buildGuidanceAbSystemPrompt(params.arm, params.schemaDump, params.guidanceBody);
  const user = buildSqlUserPrompt(params.item.question);
  let generatedSql = '';
  try {
    generatedSql = (
      await params.generateSql({
        arm: params.arm,
        caseId: params.item.id,
        question: params.item.question,
        system,
        user,
      })
    ).trim();
  } catch (err) {
    return failedArm(`llm: ${(err as Error).message}`);
  }
  if (!generatedSql) {
    return failedArm('empty SQL');
  }

  let outcome: ExecuteOutcome;
  try {
    outcome = await params.executeSql(generatedSql);
  } catch (err) {
    outcome = { kind: 'error', error: (err as Error).message };
  }
  return armResult({
    outcome,
    generatedSql,
    gold: params.gold,
    numericTolerance: params.item.numeric_tolerance,
  });
}

export async function runGuidanceAb(input: GuidanceAbRunInput): Promise<GuidanceAbReport> {
  const schemaDump = formatSchemaDump(input.columns);
  const prompts = {
    'schema-dump': buildGuidanceAbSystemPrompt('schema-dump', schemaDump, input.guidance.body),
    guidance: buildGuidanceAbSystemPrompt('guidance', schemaDump, input.guidance.body),
  };
  const items: GuidanceAbReport['items'] = [];

  for (const item of input.cases) {
    let gold: QueryResult;
    try {
      gold = await input.executeGoldSql(item.gold_sql);
    } catch (err) {
      const message = `gold SQL failed: ${(err as Error).message}`;
      items.push({
        id: item.id,
        level: item.level,
        question: item.question,
        exclusion: null,
        primary_included: false,
        target_set: false,
        arms: {
          'schema-dump': failedArm(message),
          guidance: failedArm(message),
        },
      });
      continue;
    }

    const arms = {} as GuidanceAbReport['items'][number]['arms'];
    for (const arm of ARMS) {
      arms[arm] = await runArm({
        arm,
        item,
        schemaDump,
        guidanceBody: input.guidance.body,
        gold,
        generateSql: input.generateSql,
        executeSql: input.executeSql,
      });
    }
    items.push({
      id: item.id,
      level: item.level,
      question: item.question,
      exclusion: null,
      primary_included: false,
      target_set: false,
      arms,
    });
  }

  return buildReport({
    dryRun: input.dryRun,
    fullDataset: input.fullDataset,
    llmModel: input.model,
    dataset: input.datasetPath,
    gitSha: input.gitSha,
    ffpSqlSandbox: input.ffpSqlSandbox,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt(),
    schemaDump,
    guidance: input.guidance,
    prompts,
    items,
  });
}
