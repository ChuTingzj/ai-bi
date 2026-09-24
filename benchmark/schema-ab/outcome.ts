export type SqlValidation =
  | { ok: true }
  | { ok: false; code: string; reason: string };

/**
 * Sandbox codes that reject a write (or other non-read statement) before execution.
 * NOT_READ_ONLY_PREFIX: DELETE/INSERT/UPDATE/DDL.
 * FORBIDDEN_KEYWORD: ffp-sql-sandbox denylist (COPY, GRANT, and similar).
 */
const WRITE_REJECT_CODES = new Set([
  'NOT_READ_ONLY_PREFIX',
  'FORBIDDEN_KEYWORD',
]);

export function classifyValidation(
  validation: SqlValidation,
): 'write_reject' | 'error' | null {
  if (validation.ok) return null;
  if (WRITE_REJECT_CODES.has(validation.code)) return 'write_reject';
  return 'error';
}

export function classifyPgError(err: {
  code?: string;
  message?: string;
}): 'timeout' | 'write_reject' | 'error' {
  if (err.code === '57014') return 'timeout';
  if (err.code === '25006') return 'write_reject';
  const message = err.message ?? '';
  if (/statement timeout|canceling statement due to statement timeout/i.test(message)) {
    return 'timeout';
  }
  if (/read-only transaction/i.test(message)) return 'write_reject';
  return 'error';
}
