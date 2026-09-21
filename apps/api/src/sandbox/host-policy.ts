export const READ_ONLY_REQUIRED_ERROR =
  '仅允许对只读数据源执行 SQL（isReadOnly 必须为 true）';

export const EMPTY_HOST_ERROR = '数据源主机为空，无法执行沙盒查询';

export const DENIED_HOST_ERROR = '数据源主机在拒绝列表中，禁止连接';

/**
 * Exact match after trim + case fold. Does not treat loopback as denied;
 * ffp rewrites localhost / 127.0.0.1 internally after allowlist A.
 */
const HOST_DENYLIST = new Set([
  'metadata',
  'metadata.google.internal',
  '169.254.169.254',
  'host.docker.internal',
]);

export function normalizeDataSourceHost(host: string): string {
  return host.trim();
}

export function isDeniedHost(host: string): boolean {
  return HOST_DENYLIST.has(host.trim().toLowerCase());
}

/** Allowlist A: only the DataSource-recorded host, never request-body extras. */
export function buildHostAllowlist(host: string): string[] {
  return [host.trim()];
}
