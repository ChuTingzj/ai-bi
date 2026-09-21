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
    assert.equal(out.sql_error, null);
    assert.deepEqual(out.sql_result?.columns, data.columns);
    assert.deepEqual(out.sql_result?.rows, data.rows);
    assert.equal(out.sql_result?.rowCount, 1);
    assert.equal(out.sql_result?.truncated, undefined);
  });

  it('sets truncated when the host slices a full ffp page (SANDBOX_MAX_ROWS > 1000)', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ n: i }));
    const data: QueryResult = {
      columns: ['n'],
      rows,
      rowCount: 1001,
      truncated: false,
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
    assert.equal(out.sql_error, null);
    assert.equal(out.sql_result?.truncated, true);
    assert.equal(out.sql_result?.rows.length, 1000);
    assert.equal(out.sql_result?.rowCount, 1001);
    assert.deepEqual(out.sql_result?.rows[0], { n: 0 });
    assert.deepEqual(out.sql_result?.rows[999], { n: 999 });
  });

  it('keeps ffp truncated when the host does not slice', async () => {
    const data: QueryResult = {
      columns: ['n'],
      rows: [{ n: 1 }],
      rowCount: 1,
      truncated: true,
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
    assert.equal(out.sql_result?.truncated, true);
    assert.equal(out.sql_result?.rows.length, 1);
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
