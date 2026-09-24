import { SQL_SYSTEM_PROMPT } from '../../apps/api/src/agent/graph/prompts';
import type { ArmName } from './types';

const SCHEMA_TOKEN = '{table_schema}';

function fillTableSchema(tableSchema: string): string {
  const withDialect = SQL_SYSTEM_PROMPT.replaceAll('{dialect}', 'PostgreSQL');
  const at = withDialect.indexOf(SCHEMA_TOKEN);
  if (at < 0) {
    throw new Error('SQL_SYSTEM_PROMPT is missing {table_schema}');
  }
  return (
    withDialect.slice(0, at) + tableSchema + withDialect.slice(at + SCHEMA_TOKEN.length)
  );
}

/**
 * Both arms use the production SQL system prompt.
 * no-schema leaves the schema slot empty. schema-dump inserts the catalog text.
 */
export function buildSqlSystemPrompt(arm: ArmName, schemaDump: string): string {
  switch (arm) {
    case 'no-schema':
      return fillTableSchema('');
    case 'schema-dump':
      return fillTableSchema(schemaDump);
    default: {
      const unexpected: never = arm;
      throw new Error(`unexpected arm: ${unexpected}`);
    }
  }
}

/** Same user text for both arms. The question is the only NL input. */
export function buildSqlUserPrompt(question: string): string {
  return `问题：${question}`;
}
