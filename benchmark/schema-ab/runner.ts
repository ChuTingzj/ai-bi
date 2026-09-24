import type { QueryResult } from '@ai-bi/shared';
import { buildSqlSystemPrompt, buildSqlUserPrompt } from './prompt';
import { buildReport } from './report';
import { scoreCandidate } from './score';
import {
  ARMS,
  type ArmItemResult,
  type ArmName,
  type ExecuteOutcome,
  type SchemaAbCase,
  type SchemaAbItem,
  type SchemaAbReport,
  type SchemaColumn,
} from './types';
import { formatSchemaDump } from './schema-dump';

export interface GenerateSqlRequest {
  arm: ArmName;
  caseId: string;
  question: string;
  system: string;
  user: string;
}

export interface SchemaAbRunInput {
  cases: SchemaAbCase[];
  columns: SchemaColumn[];
  model: string;
  datasetPath: string;
  gitSha: string;
  ffpSqlSandbox: string;
  dryRun: boolean;
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
  gold: QueryResult;
  generateSql: SchemaAbRunInput['generateSql'];
  executeSql: SchemaAbRunInput['executeSql'];
}): Promise<ArmItemResult> {
  const system = buildSqlSystemPrompt(params.arm, params.schemaDump);
  const user = buildSqlUserPrompt(params.item.question);
  let generatedSql = '';
  try {
    generatedSql = (await params.generateSql({
      arm: params.arm,
      caseId: params.item.id,
      question: params.item.question,
      system,
      user,
    })).trim();
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

export async function runSchemaAb(input: SchemaAbRunInput): Promise<SchemaAbReport> {
  const schemaDump = formatSchemaDump(input.columns);
  const prompts = {
    'no-schema': buildSqlSystemPrompt('no-schema', schemaDump),
    'schema-dump': buildSqlSystemPrompt('schema-dump', schemaDump),
  };
  const items: SchemaAbItem[] = [];

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
        arms: {
          'no-schema': failedArm(message),
          'schema-dump': failedArm(message),
        },
      });
      continue;
    }

    const arms = {} as SchemaAbItem['arms'];
    for (const arm of ARMS) {
      arms[arm] = await runArm({
        arm,
        item,
        schemaDump,
        gold,
        generateSql: input.generateSql,
        executeSql: input.executeSql,
      });
    }
    items.push({
      id: item.id,
      level: item.level,
      question: item.question,
      arms,
    });
  }

  return buildReport({
    dryRun: input.dryRun,
    llmModel: input.model,
    dataset: input.datasetPath,
    gitSha: input.gitSha,
    ffpSqlSandbox: input.ffpSqlSandbox,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt(),
    schemaDump,
    prompts,
    items,
  });
}
