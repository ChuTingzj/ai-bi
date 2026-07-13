const FORBIDDEN_PATTERNS: RegExp[] = [
  /\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i,
  /\b(EXEC|EXECUTE|xp_)\b/i,
  /;\s*\S/, // 多语句注入
];

const ALLOWED_PREFIX = /^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN)\b/i;

export function validateSql(sql: string): { valid: boolean; reason?: string } {
  const trimmed = sql.trim();

  if (!ALLOWED_PREFIX.test(trimmed)) {
    return {
      valid: false,
      reason: '仅允许 SELECT / WITH / SHOW / DESCRIBE / EXPLAIN 语句',
    };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `检测到被禁止的 SQL 模式: ${pattern}` };
    }
  }

  return { valid: true };
}
