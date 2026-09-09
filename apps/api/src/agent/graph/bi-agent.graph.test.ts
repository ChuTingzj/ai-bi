import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { QueryResult } from '@ai-bi/shared';
import {
  routeAfterPlanner,
  routeAfterSqlExecution,
} from './bi-agent.graph';
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
    data_source_id: '',
    session_id: '',
    analyst_text: '',
    after_guidance: false,
    guidance: null,
    schema_doc: '',
    ...partial,
  };
}

const rows: QueryResult = {
  columns: ['n'],
  rows: [{ n: 1 }],
  rowCount: 1,
};

describe('routeAfterPlanner', () => {
  it('continues to schemaFetcher when at least one table was recalled', () => {
    assert.equal(
      routeAfterPlanner(state({ relevant_tables: ['orders'] })),
      'schemaFetcher',
    );
  });

  it('enters guidance on first failure when no tables were recalled', () => {
    assert.equal(routeAfterPlanner(state({ relevant_tables: [] })), 'guidanceExit');
    assert.equal(
      routeAfterPlanner(state({ relevant_tables: [], after_guidance: false })),
      'guidanceExit',
    );
  });

  it('exits as intent-fail when guidance already ran and still no tables', () => {
    assert.equal(
      routeAfterPlanner(state({ relevant_tables: [], after_guidance: true })),
      'intentFailExit',
    );
  });

  it('prefers schemaFetcher over intent-fail when tables exist after guidance', () => {
    assert.equal(
      routeAfterPlanner(
        state({ relevant_tables: ['users'], after_guidance: true }),
      ),
      'schemaFetcher',
    );
  });
});

describe('routeAfterSqlExecution', () => {
  it('advances to chartGenerator when execution produced a result without error', () => {
    assert.equal(
      routeAfterSqlExecution(state({ sql_result: rows, sql_error: null })),
      'chartGenerator',
    );
  });

  it('retries sqlGenerator while error_count is below 3', () => {
    assert.equal(
      routeAfterSqlExecution(state({ sql_error: 'syntax', error_count: 0 })),
      'sqlGenerator',
    );
    assert.equal(
      routeAfterSqlExecution(state({ sql_error: 'syntax', error_count: 1 })),
      'sqlGenerator',
    );
    assert.equal(
      routeAfterSqlExecution(state({ sql_error: 'syntax', error_count: 2 })),
      'sqlGenerator',
    );
  });

  it('falls back after 3 failed executions', () => {
    assert.equal(
      routeAfterSqlExecution(state({ sql_error: 'syntax', error_count: 3 })),
      'fallback',
    );
    assert.equal(
      routeAfterSqlExecution(state({ sql_error: 'syntax', error_count: 4 })),
      'fallback',
    );
  });

  it('does not treat a result paired with sql_error as success', () => {
    assert.equal(
      routeAfterSqlExecution(
        state({ sql_result: rows, sql_error: 'stale', error_count: 1 }),
      ),
      'sqlGenerator',
    );
    assert.equal(
      routeAfterSqlExecution(
        state({ sql_result: rows, sql_error: 'stale', error_count: 3 }),
      ),
      'fallback',
    );
  });
});
