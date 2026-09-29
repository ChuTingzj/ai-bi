import {
  fillSqlSystemPrompt,
  formatSqlQuestionLine,
} from '../../apps/api/src/agent/graph/sql-guidance';
import type { ArmName } from './types';

/**
 * Both arms fill the production SQL system prompt's schema slot.
 * no-schema leaves the schema slot empty. schema-dump inserts the catalog text.
 * This harness does not append the frozen guidance addendum. Product SQL generation does.
 */
export function buildSqlSystemPrompt(arm: ArmName, schemaDump: string): string {
  switch (arm) {
    case 'no-schema':
      return fillSqlSystemPrompt('PostgreSQL', '');
    case 'schema-dump':
      return fillSqlSystemPrompt('PostgreSQL', schemaDump);
    default: {
      const unexpected: never = arm;
      throw new Error(`unexpected arm: ${unexpected}`);
    }
  }
}

/** Same user text for both arms. The question is the only NL input. */
export function buildSqlUserPrompt(question: string): string {
  return formatSqlQuestionLine(question);
}
