import type { QueryResult } from '@ai-bi/shared';
import { scoreSql } from '../../apps/api/src/benchmark/scorers/sql.scorer';
import type { ExecuteOutcome } from './types';

export interface CandidateScore {
  pass: boolean;
  exec_at_1: boolean;
  sql_value_match: boolean;
}

/** One shot. Pass iff the existing scorer's exec@1 and sql_value_match are both true. */
export function scoreCandidate(params: {
  outcome: ExecuteOutcome;
  gold: QueryResult;
  numericTolerance?: number;
}): CandidateScore {
  const executed = params.outcome.kind === 'ok' ? params.outcome.result : null;
  const sqlError = params.outcome.kind === 'ok' ? null : params.outcome.error;
  const score = scoreSql({
    sql_attempts: 1,
    sql_result: executed,
    sql_error: sqlError,
    fallback: false,
    gold_result: params.gold,
    numeric_tolerance: params.numericTolerance,
  });
  return {
    pass: score.exec_at_1 && score.sql_value_match,
    exec_at_1: score.exec_at_1,
    sql_value_match: score.sql_value_match,
  };
}
