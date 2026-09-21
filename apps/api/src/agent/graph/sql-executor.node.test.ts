import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataSource } from '@ai-bi/db';
import type { QueryResult } from '@ai-bi/shared';
import { createNodes } from './nodes';
import type { BiAgentState } from './state';

function state(partial: Partial<BiAgentState>): BiAgentState {
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
    ...partial,
  };
}

const ds = {
  id: 'ds-1',
  host: 'db.internal',
} as DataSource;

describe('sqlExecutorNode', () => {
  it('returns sql_result on sandbox success', async () => {
    const data: QueryResult = {
      columns: ['n'],
      rows: [{ n: 1 }],
      rowCount: 1,
    };
    const nodes = createNodes({
      prisma: {
        dataSource: {
          findUnique: async () => ds,
        },
      } as never,
      sandbox: {
        execute: async () => ({ success: true, data }),
      } as never,
      llm: {} as never,
    });
    const out = await nodes.sqlExecutorNode(state({}));
    assert.deepEqual(out, { sql_result: data, sql_error: null });
  });

  it('returns sql_error and increments error_count on sandbox failure', async () => {
    const nodes = createNodes({
      prisma: {
        dataSource: {
          findUnique: async () => ds,
        },
      } as never,
      sandbox: {
        execute: async () => ({ success: false, error: 'boom' }),
      } as never,
      llm: {} as never,
    });
    const out = await nodes.sqlExecutorNode(state({ error_count: 1 }));
    assert.deepEqual(out, {
      sql_result: null,
      sql_error: 'boom',
      error_count: 2,
    });
  });
});
