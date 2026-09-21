import type {
  ExecuteSqlInput,
  ExecuteSqlResult,
  QueryResultData,
  SandboxLimits,
  ValidateSqlResult,
} from 'ffp-sql-sandbox';

export type {
  ExecuteSqlInput,
  ExecuteSqlResult,
  QueryResultData,
  SandboxLimits,
  ValidateSqlResult,
};

export type ExecuteSqlFn = (
  input: ExecuteSqlInput,
) => Promise<ExecuteSqlResult>;

type FfpSqlSandboxModule = {
  validateSql: (sql: string) => ValidateSqlResult;
  executeSql: ExecuteSqlFn;
  DEFAULT_SANDBOX_IMAGE: string;
  DEFAULT_SANDBOX_LIMITS: SandboxLimits;
};

/**
 * ffp-sql-sandbox is ESM-only. Nest emits CommonJS, and tsc would rewrite
 * `import('ffp-sql-sandbox')` to `require()`, which Node rejects. `new Function`
 * keeps a real dynamic import at runtime.
 */
const importEsm = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<FfpSqlSandboxModule>;

const ffpSqlSandbox = importEsm('ffp-sql-sandbox');

export async function validateSql(sql: string): Promise<ValidateSqlResult> {
  const { validateSql: validate } = await ffpSqlSandbox;
  return validate(sql);
}

export async function executeSql(
  input: ExecuteSqlInput,
): Promise<ExecuteSqlResult> {
  const { executeSql: run } = await ffpSqlSandbox;
  return run(input);
}

export async function sandboxPackageDefaults(): Promise<{
  image: string;
  limits: SandboxLimits;
}> {
  const { DEFAULT_SANDBOX_IMAGE, DEFAULT_SANDBOX_LIMITS } = await ffpSqlSandbox;
  return { image: DEFAULT_SANDBOX_IMAGE, limits: DEFAULT_SANDBOX_LIMITS };
}
