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
    case 'guidance': {
      const body = guidanceBody.trim();
      if (!body) {
        throw new Error('Guidance template body is empty. Refusing to run arm B.');
      }
      return `${dump}\n\n${body}\n`;
    }
    default: {
      const unexpected: never = arm;
      throw new Error(`unexpected arm: ${unexpected}`);
    }
  }
}
