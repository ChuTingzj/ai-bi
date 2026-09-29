import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadGuidanceTemplate } from '../../../../../benchmark/guidance-ab/guidance';
import { buildGuidanceAbSystemPrompt } from '../../../../../benchmark/guidance-ab/prompt';
import { createNodes } from './nodes';
import { fillSqlSystemPrompt } from './sql-guidance';
import type { BiAgentState } from './state';

function state(partial: Partial<BiAgentState>): BiAgentState {
  return {
    question: '',
    intent: null,
    relevant_tables: [],
    table_schema: '',
    generated_sql: '',
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
    ...partial,
  };
}

const SCHEMA = 'CREATE TABLE orders (\n  id integer\n  status character varying\n);';
const QUESTION = '近30天销售额，取消的算不算？';
const INTENT = { summary: 'gmv', relevant_tables: ['orders'] } as BiAgentState['intent'];

async function captureSqlMessages(
  dialectType: string,
  tableSchema: string,
  partial: Partial<BiAgentState> = {},
): Promise<{ system: string; human: string }> {
  let system = '';
  let human = '';
  const nodes = createNodes({
    prisma: {
      dataSource: {
        findUnique: async () => ({ type: dialectType }),
      },
    } as never,
    sandbox: {} as never,
    llm: {
      create: () => ({
        invoke: async (messages: Array<{ content: unknown }>) => {
          system = String(messages[0]?.content ?? '');
          human = String(messages[1]?.content ?? '');
          return { content: 'SELECT 1' };
        },
      }),
    } as never,
  });
  const out = await nodes.sqlGeneratorNode(
    state({
      question: QUESTION,
      table_schema: tableSchema,
      intent: INTENT,
      ...partial,
    }),
  );
  assert.equal(out.generated_sql, 'SELECT 1');
  assert.equal(system.length > 0, true);
  return { system, human };
}

describe('sqlGeneratorNode guidance addendum', () => {
  it('matches arm B for PostgreSQL: schema dump slot plus the frozen guidance body', async () => {
    const guidance = loadGuidanceTemplate();
    const { system } = await captureSqlMessages('POSTGRES', SCHEMA);
    const armB = buildGuidanceAbSystemPrompt('guidance', SCHEMA, guidance.body);

    assert.equal(system.includes(SCHEMA), true);
    assert.equal(system.includes('{table_schema}'), false);
    assert.equal(system.includes(guidance.body.trim()), true);
    assert.equal(system.indexOf(SCHEMA) < system.indexOf(guidance.body.trim()), true);
    assert.equal(system, armB);
  });

  it('matches arm B when the schema slot is empty', async () => {
    const guidance = loadGuidanceTemplate();
    const { system } = await captureSqlMessages('POSTGRES', '');
    const armB = buildGuidanceAbSystemPrompt('guidance', '', guidance.body);
    assert.equal(system.includes('{table_schema}'), false);
    assert.equal(system.includes(guidance.body.trim()), true);
    assert.equal(system, armB);
  });

  it('keeps the schema dump and the same guidance body on MySQL', async () => {
    const guidance = loadGuidanceTemplate();
    const { system } = await captureSqlMessages('MYSQL', SCHEMA);
    const postgresArmB = buildGuidanceAbSystemPrompt('guidance', SCHEMA, guidance.body);

    assert.equal(system.includes('MySQL'), true);
    assert.equal(system.includes(SCHEMA), true);
    assert.equal(system.includes(guidance.body.trim()), true);
    assert.equal(system.indexOf(SCHEMA) < system.indexOf(guidance.body.trim()), true);
    assert.equal(system === postgresArmB, false);
  });

  it('sends the raw state question as 问题： plus planner intent', async () => {
    const { human } = await captureSqlMessages('POSTGRES', SCHEMA);
    const questionLine = `问题：${QUESTION}`;
    assert.equal(human.includes(questionLine), true);
    assert.equal(human.startsWith(questionLine), true);
    assert.equal(human.includes(`查询意图：${JSON.stringify(INTENT)}`), true);
    assert.equal(human.indexOf(questionLine) < human.indexOf('查询意图：'), true);
  });

  it('keeps the question line when retrying a SQL error', async () => {
    const { human } = await captureSqlMessages('POSTGRES', SCHEMA, {
      sql_error: 'column "gmv" does not exist',
      generated_sql: 'SELECT gmv FROM orders',
    });
    assert.equal(human.includes(`问题：${QUESTION}`), true);
    assert.equal(human.includes(`查询意图：${JSON.stringify(INTENT)}`), true);
    assert.equal(human.includes('上一次生成的 SQL：SELECT gmv FROM orders'), true);
    assert.equal(human.includes('上一次执行错误：column "gmv" does not exist'), true);
  });
});

async function withSqlGuidanceEnv<T>(
  value: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const previous = process.env.SQL_GUIDANCE_ENABLED;
  if (value === undefined) {
    delete process.env.SQL_GUIDANCE_ENABLED;
  } else {
    process.env.SQL_GUIDANCE_ENABLED = value;
  }
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.SQL_GUIDANCE_ENABLED;
    } else {
      process.env.SQL_GUIDANCE_ENABLED = previous;
    }
  }
}

describe('sqlGeneratorNode SQL_GUIDANCE_ENABLED', () => {
  const retryState = {
    sql_error: 'column "gmv" does not exist',
    generated_sql: 'SELECT gmv FROM orders',
  };

  it('defaults on when SQL_GUIDANCE_ENABLED is unset', async () => {
    const guidance = loadGuidanceTemplate();
    const { system, human } = await withSqlGuidanceEnv(undefined, () =>
      captureSqlMessages('POSTGRES', SCHEMA, retryState),
    );
    const armB = buildGuidanceAbSystemPrompt('guidance', SCHEMA, guidance.body);
    assert.equal(system, armB);
    assert.equal(human.startsWith(`问题：${QUESTION}`), true);
    assert.equal(human.includes(`查询意图：${JSON.stringify(INTENT)}`), true);
    assert.equal(human.includes('上一次执行错误：column "gmv" does not exist'), true);
  });

  it('appends guidance when SQL_GUIDANCE_ENABLED is true or 1', async () => {
    const guidance = loadGuidanceTemplate();
    const armB = buildGuidanceAbSystemPrompt('guidance', SCHEMA, guidance.body);
    for (const value of ['true', '1', ' TRUE ']) {
      const { system, human } = await withSqlGuidanceEnv(value, () =>
        captureSqlMessages('POSTGRES', SCHEMA),
      );
      assert.equal(system, armB);
      assert.equal(human, `问题：${QUESTION}\n\n查询意图：${JSON.stringify(INTENT)}`);
    }
  });

  it('skips the addendum when SQL_GUIDANCE_ENABLED is false, 0, or off', async () => {
    const guidance = loadGuidanceTemplate();
    const schemaOnly = fillSqlSystemPrompt('PostgreSQL', SCHEMA);
    const enabled = await withSqlGuidanceEnv('true', () =>
      captureSqlMessages('POSTGRES', SCHEMA, retryState),
    );
    for (const value of ['false', '0', 'off', ' OFF ']) {
      const { system, human } = await withSqlGuidanceEnv(value, () =>
        captureSqlMessages('POSTGRES', SCHEMA, retryState),
      );
      assert.equal(system, schemaOnly);
      assert.equal(system.includes(guidance.body.trim()), false);
      assert.equal(system.includes('{table_schema}'), false);
      assert.equal(human, enabled.human);
    }
  });
});
