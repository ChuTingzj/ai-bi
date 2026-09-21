import type { DataSourceType } from '@ai-bi/db';
import type { SandboxLimits } from './ffp-client';

export function envInt(
  name: string,
  fallback: number,
  env: NodeJS.Dict<string> = process.env,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) {
    return fallback;
  }
  return n;
}

/** Only pass `image` to ffp when SANDBOX_IMAGE is explicitly set. */
export function explicitSandboxImage(
  env: NodeJS.Dict<string> = process.env,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(env, 'SANDBOX_IMAGE')) {
    return undefined;
  }
  const trimmed = (env.SANDBOX_IMAGE ?? '').trim();
  return trimmed === '' ? undefined : trimmed;
}

export function mapDialect(
  type: DataSourceType,
): 'mysql' | 'postgres' {
  switch (type) {
    case 'MYSQL':
      return 'mysql';
    case 'POSTGRESQL':
      return 'postgres';
    default: {
      const unexpected: never = type;
      return unexpected;
    }
  }
}

export function sandboxLimitsFromEnv(
  defaults: SandboxLimits,
  env: NodeJS.Dict<string> = process.env,
): Pick<SandboxLimits, 'timeoutMs' | 'memoryMb' | 'maxRows' | 'maxBytes'> {
  return {
    timeoutMs: envInt('SANDBOX_TIMEOUT_MS', defaults.timeoutMs, env),
    memoryMb: envInt('SANDBOX_MEMORY_MB', defaults.memoryMb, env),
    maxRows: envInt('SANDBOX_MAX_ROWS', defaults.maxRows, env),
    maxBytes: envInt('SANDBOX_MAX_BYTES', defaults.maxBytes, env),
  };
}
