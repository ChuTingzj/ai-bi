import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { SQL_SYSTEM_PROMPT } from './prompts';

export const GUIDANCE_TEMPLATE_VERSION = 'guidance-intent-agg-grain-v1';

/** Product kill switch. The guidance-ab harness does not read this. */
export const SQL_GUIDANCE_ENABLED_ENV = 'SQL_GUIDANCE_ENABLED';

export const GUIDANCE_TEMPLATE_REPO_PATH =
  'apps/api/src/agent/graph/templates/intent-aggregation-grain-v1.md';

/** Harness user line. Product SQL prepends this to planner JSON. */
export function formatSqlQuestionLine(question: string): string {
  return `问题：${question}`;
}

const TEMPLATE_FILENAME = 'intent-aggregation-grain-v1.md';
const SCHEMA_TOKEN = '{table_schema}';
const VERSION_LINE = /^version:\s*(\S+)\s*$/m;

function resolveDefaultTemplateFile(): string {
  const besideModule = join(__dirname, 'templates', TEMPLATE_FILENAME);
  if (existsSync(besideModule)) return besideModule;
  // Compiled output lives in dist/. Nest copies the template beside it; the API image also keeps src/.
  return resolve(__dirname, '../../../src/agent/graph/templates', TEMPLATE_FILENAME);
}

export const GUIDANCE_TEMPLATE_FILE = resolveDefaultTemplateFile();

export interface FrozenGuidanceTemplate {
  version: string;
  path: string;
  sha256: string;
  body: string;
}

export function loadGuidanceTemplate(
  filePath: string = GUIDANCE_TEMPLATE_FILE,
): FrozenGuidanceTemplate {
  const body = readFileSync(filePath, 'utf8');
  const version = VERSION_LINE.exec(body)?.[1];
  if (version !== GUIDANCE_TEMPLATE_VERSION) {
    throw new Error(
      `Guidance template version must be ${GUIDANCE_TEMPLATE_VERSION}. Found ${version ?? 'none'}.`,
    );
  }
  const sha256 = createHash('sha256').update(body).digest('hex');
  const checksumPath = `${filePath}.sha256`;
  const expected = readFileSync(checksumPath, 'utf8').trim();
  if (sha256 !== expected) {
    throw new Error(
      `Guidance template checksum mismatch for ${GUIDANCE_TEMPLATE_REPO_PATH}. ` +
        `File sha256 ${sha256} does not match ${checksumPath}. ` +
        'Bump the version and checksum together. Do not edit the template mid-run.',
    );
  }
  return {
    version,
    path: GUIDANCE_TEMPLATE_REPO_PATH,
    sha256,
    body,
  };
}

export function fillSqlSystemPrompt(dialect: string, tableSchema: string): string {
  const withDialect = SQL_SYSTEM_PROMPT.replaceAll('{dialect}', dialect);
  const at = withDialect.indexOf(SCHEMA_TOKEN);
  if (at < 0) {
    throw new Error('SQL_SYSTEM_PROMPT is missing {table_schema}');
  }
  return withDialect.slice(0, at) + tableSchema + withDialect.slice(at + SCHEMA_TOKEN.length);
}

/**
 * Product SQL addendum switch. Default on.
 * On: unset, empty, `true`, `1`. Off: `false`, `0`, `off` (trim, case-insensitive).
 * Any other value stays on so a typo does not drop the addendum.
 * Callers that must keep arm B (the guidance-ab harness) ignore this and call
 * `appendGuidanceAddendum` directly.
 */
export function sqlGuidanceEnabledFromEnv(
  env: NodeJS.Dict<string> = process.env,
): boolean {
  const raw = env[SQL_GUIDANCE_ENABLED_ENV];
  if (raw === undefined) return true;
  const value = raw.trim().toLowerCase();
  if (value === '' || value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0' || value === 'off') return false;
  return true;
}

/** `${filled}\n\n${body.trim()}\n` — the guidance-ab arm B addendum. */
export function appendGuidanceAddendum(
  schemaFilledSystemPrompt: string,
  guidanceBody: string,
): string {
  const body = guidanceBody.trim();
  if (!body) {
    throw new Error('Guidance template body is empty. Refusing to run arm B.');
  }
  return `${schemaFilledSystemPrompt}\n\n${body}\n`;
}

export function buildSqlSystemPromptWithGuidance(
  dialect: string,
  tableSchema: string,
  guidanceBody: string,
): string {
  return appendGuidanceAddendum(fillSqlSystemPrompt(dialect, tableSchema), guidanceBody);
}
