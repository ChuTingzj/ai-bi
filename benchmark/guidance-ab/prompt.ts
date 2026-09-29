import { appendGuidanceAddendum } from '../../apps/api/src/agent/graph/sql-guidance';
import { buildSqlSystemPrompt, buildSqlUserPrompt } from '../schema-ab/prompt';
import type { ArmName } from './types';

export { buildSqlUserPrompt };

/**
 * Arm A is the schema-ab schema-dump prompt.
 * Arm B appends the frozen guidance file. The runner passes that file's body through.
 */
export function buildGuidanceAbSystemPrompt(
  arm: ArmName,
  schemaDump: string,
  guidanceBody: string,
): string {
  const dump = buildSqlSystemPrompt('schema-dump', schemaDump);
  switch (arm) {
    case 'schema-dump':
      return dump;
    case 'guidance':
      return appendGuidanceAddendum(dump, guidanceBody);
    default: {
      const unexpected: never = arm;
      throw new Error(`unexpected arm: ${unexpected}`);
    }
  }
}
