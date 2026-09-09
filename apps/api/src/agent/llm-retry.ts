const TRANSIENT_MESSAGE_PATTERNS = [
  /JSON error injected into SSE stream/i,
  /provider_unavailable/i,
  /provider_overloaded/i,
  /rate[_ ]?limit/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /socket hang up/i,
  /network error/i,
  /status code 5\d\d/i,
  /status 5\d\d/i,
  /"code"\s*:\s*5\d\d/,
  /Bad Gateway/i,
  /Service Unavailable/i,
  /Gateway Timeout/i,
];

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504, 524]);
const TRANSIENT_ERROR_TYPES = new Set([
  'provider_unavailable',
  'provider_overloaded',
  'rate_limit_exceeded',
  'timeout',
]);

function readStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const record = err as Record<string, unknown>;
  for (const key of ['status', 'statusCode', 'code'] as const) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  }
  const nested = record.error;
  if (nested && typeof nested === 'object') {
    const code = (nested as Record<string, unknown>).code;
    if (typeof code === 'number') return code;
    if (typeof code === 'string' && /^\d+$/.test(code)) return Number(code);
  }
  return undefined;
}

function readErrorType(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const record = err as Record<string, unknown>;
  const nested = record.error;
  if (nested && typeof nested === 'object') {
    const metadata = (nested as Record<string, unknown>).metadata;
    if (metadata && typeof metadata === 'object') {
      const errorType = (metadata as Record<string, unknown>).error_type;
      if (typeof errorType === 'string') return errorType;
    }
  }
  return undefined;
}

export function isTransientLlmError(err: unknown): boolean {
  const status = readStatus(err);
  if (status != null) {
    if (status === 401 || status === 402 || status === 403 || status === 400) {
      return false;
    }
    if (TRANSIENT_STATUS.has(status)) return true;
  }

  const errorType = readErrorType(err);
  if (errorType && TRANSIENT_ERROR_TYPES.has(errorType)) return true;

  const message = err instanceof Error ? err.message : String(err ?? '');
  if (/invalid api key|unauthorized|insufficient credits|payment required/i.test(message)) {
    return false;
  }
  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

export function formatUserFacingLlmError(err: unknown): string {
  if (isTransientLlmError(err)) {
    return '模型服务暂时不可用或中断，请稍后重试';
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return '服务器内部错误';
}

export interface LlmRetryOptions {
  retries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withLlmRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: LlmRetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (
        attempt >= retries ||
        !isTransientLlmError(err) ||
        options.signal?.aborted
      ) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await sleep(delay, options.signal);
    }
  }

  throw lastError;
}
