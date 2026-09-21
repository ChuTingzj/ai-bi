# ADR: SQL sandbox via ffp-sql-sandbox (allowlist A, denylist, R1)

Pinned dependency: `ffp-sql-sandbox@0.1.5`. Nest keeps `SandboxService.execute(sql, dataSource)` as the host facade. Docker container create/exec, password-in-`Env`, and the local SQL validator execution path live in the package (or are deleted), not in this adapter.

## Allowlist A

`hostAllowlist = [dataSource.host.trim()]`. Only the host recorded on the Prisma `DataSource` is allowlisted. Request bodies, user-typed hosts, and extra env unions are not appended.

- `connection.host` is that same trimmed string.
- Empty host → `{ success: false }` immediately; ffp is not called.
- Loopback (`localhost`, `127.0.0.1`, …) is **allowed**. ffp rewrites it privately after the allowlist check.

A only stops SQL/callers from **changing** the host. It does **not** stop an admin from registering a dangerous host as the data source.

## Minimal host denylist

Trim + case-insensitive **exact** match, rejected **before** `executeSql`:

- `metadata`
- `metadata.google.internal`
- `169.254.169.254`
- `host.docker.internal`

Registering the Docker gateway name itself as a DS host is forbidden. Loopback names are not on this list.

## R1 (read-only identity)

`dataSource.isReadOnly === true` is required to call ffp. If `isReadOnly === false` (or not true), the adapter refuses immediately with a clear error and does not call `validateSql` / `executeSql`.

ffp `validateSql` is fail-fast only. The product still requires a read-only DB role; regex is not a write barrier.

## Secrets and image

- Password is decrypted with `CryptoService` in this adapter and passed to `executeSql` as `connection.password`. ffp writes it to a host ephemeral file and bind-mounts it **read-only** at `/run/secrets/db_password`. Container `Env` must not contain the password (`DB_PASS` / `PGPASSWORD` are forbidden here).
- Default runner image is package `DEFAULT_SANDBOX_IMAGE` (`ghcr.io/ffp-tech-lab/ffp-sql-sandbox-runner@sha256:57767f4e80e9f5c6066eeaf996f3101c7ce4ea2740538c06523eeaaf0b15feb6`). The 0.1.5 runner keeps Postgres column metadata from `result.fields` and adds a MySQL wall-clock `QUERY_TIMEOUT` watchdog plus line-level demux. `image` is passed only when `SANDBOX_IMAGE` is explicitly set (untrusted override).
- Limits: `SANDBOX_TIMEOUT_MS`, `SANDBOX_MEMORY_MB`, `SANDBOX_MAX_ROWS`, `SANDBOX_MAX_BYTES`, falling back to `DEFAULT_SANDBOX_LIMITS`.

## `checkDockerAvailable`

Pings the Docker daemon only (`docker-ping.ts`). A missing image is `execute` → `IMAGE_UNAVAILABLE`, not "Docker unavailable".

## Host row limit

`applyHostRowLimit` (`RESULT_ROW_LIMIT` = 1000) runs in `sqlExecutorNode` after a successful `sandbox.execute`. Chat (LangGraph) and Lab (`rerunFromSql` → the same node) share that path so they cannot drift. `truncated = ffpTruncated || hostDidSlice`. If `SANDBOX_MAX_ROWS` is raised above 1000, the host still slices and sets `truncated`.
