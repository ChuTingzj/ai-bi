import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadGuidanceTemplate } from '../../../../../benchmark/guidance-ab/guidance';
import { buildGuidanceAbSystemPrompt } from '../../../../../benchmark/guidance-ab/prompt';
import { createNodes } from './nodes';
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

async function captureSqlSystemPrompt(dialectType: string, tableSchema: string): Promise<string> {
  let system = '';
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
          return { content: 'SELECT 1' };
        },
      }),
    } as never,
  });
  const out = await nodes.sqlGeneratorNode(
    state({
      table_schema: tableSchema,
      intent: { summary: 'gmv', relevant_tables: ['orders'] } as BiAgentState['intent'],
    }),
  );
  assert.equal(out.generated_sql, 'SELECT 1');
  assert.equal(system.length > 0, true);
  return system;
}

describe('sqlGeneratorNode guidance addendum', () => {
  it('matches arm B for PostgreSQL: schema dump slot plus the frozen guidance body', async () => {
    const guidance = loadGuidanceTemplate();
    const system = await captureSqlSystemPrompt('POSTGRES', SCHEMA);
    const armB = buildGuidanceAbSystemPrompt('guidance', SCHEMA, guidance.body);

    assert.equal(system.includes(SCHEMA), true);
    assert.equal(system.includes('{table_schema}'), false);
    assert.equal(system.includes(guidance.body.trim()), true);
    assert.equal(system.indexOf(SCHEMA) < system.indexOf(guidance.body.trim()), true);
    assert.equal(system, armB);
  });

  it('matches arm B when the schema slot is empty', async () => {
    const guidance = loadGuidanceTemplate();
    const system = await captureSqlSystemPrompt('POSTGRES', '');
    const armB = buildGuidanceAbSystemPrompt('guidance', '', guidance.body);
    assert.equal(system.includes('{table_schema}'), false);
    assert.equal(system.includes(guidance.body.trim()), true);
    assert.equal(system, armB);
  });

  it('keeps the schema dump and the same guidance body on MySQL', async () => {
    const guidance = loadGuidanceTemplate();
    const system = await captureSqlSystemPrompt('MYSQL', SCHEMA);
    const postgresArmB = buildGuidanceAbSystemPrompt('guidance', SCHEMA, guidance.body);

    assert.equal(system.includes('MySQL'), true);
    assert.equal(system.includes(SCHEMA), true);
    assert.equal(system.includes(guidance.body.trim()), true);
    assert.equal(system.indexOf(SCHEMA) < system.indexOf(guidance.body.trim()), true);
    assert.equal(system === postgresArmB, false);
  });
});
