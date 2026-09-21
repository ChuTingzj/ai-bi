const SANDBOX_ERROR_MESSAGES = {
  HOST_NOT_ALLOWED: '目标数据库主机不在允许列表中',
  DOCKER_UNAVAILABLE: 'Docker 引擎不可用，无法执行 SQL',
  TIMEOUT: 'SQL 执行超时，已终止沙盒',
  IMAGE_UNAVAILABLE:
    '沙盒镜像不可用，请先拉取 ffp-sql-sandbox 默认 digest 镜像',
  IMAGE_UNPINNED: '默认沙盒镜像必须使用 sha256 digest 固定版本',
  INVALID_LIMITS: '沙盒资源限制配置无效',
  UNSUPPORTED_DIALECT: '不支持的数据库类型',
  EXECUTION_FAILED: '沙盒执行失败',
  NOT_READ_ONLY_PREFIX: '仅允许 SELECT / WITH / SHOW / DESCRIBE / EXPLAIN 语句',
  FORBIDDEN_KEYWORD: '检测到被禁止的 SQL 关键字',
  MULTI_STATEMENT: '不允许执行多条 SQL 语句',
} as const;

type MappedSandboxErrorCode = keyof typeof SANDBOX_ERROR_MESSAGES;

function isMappedCode(code: string): code is MappedSandboxErrorCode {
  return Object.prototype.hasOwnProperty.call(SANDBOX_ERROR_MESSAGES, code);
}

export function mapSandboxError(code: string, error: string): string {
  if (!isMappedCode(code)) {
    return error || '沙盒执行失败';
  }
  const mapped = SANDBOX_ERROR_MESSAGES[code];
  if (code === 'EXECUTION_FAILED' && error) {
    return `${mapped}：${error}`;
  }
  return mapped;
}
