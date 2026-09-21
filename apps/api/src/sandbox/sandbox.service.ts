import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { DataSource } from '@ai-bi/db';
import type { SandboxResult } from '@ai-bi/shared';
import { CryptoService } from '../common/crypto.service';
import { pingDockerDaemon } from './docker-ping';
import {
  explicitSandboxImage,
  mapDialect,
  sandboxLimitsFromEnv,
} from './env';
import { mapSandboxError } from './error-map';
import {
  executeSql as defaultExecuteSql,
  sandboxPackageDefaults,
  validateSql,
  type ExecuteSqlFn,
} from './ffp-client';
import {
  buildHostAllowlist,
  DENIED_HOST_ERROR,
  EMPTY_HOST_ERROR,
  isDeniedHost,
  normalizeDataSourceHost,
  READ_ONLY_REQUIRED_ERROR,
} from './host-policy';
import { toQueryResult } from './query-result';

export const SANDBOX_EXECUTE_SQL = 'SANDBOX_EXECUTE_SQL';
export const SANDBOX_DOCKER_PING = 'SANDBOX_DOCKER_PING';

export type { ExecuteSqlFn };

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly executeSqlFn: ExecuteSqlFn;
  private readonly pingFn: () => Promise<boolean>;

  constructor(
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Optional()
    @Inject(SANDBOX_EXECUTE_SQL)
    executeSqlFn?: ExecuteSqlFn,
    @Optional()
    @Inject(SANDBOX_DOCKER_PING)
    pingFn?: () => Promise<boolean>,
  ) {
    this.executeSqlFn = executeSqlFn ?? defaultExecuteSql;
    this.pingFn = pingFn ?? pingDockerDaemon;
  }

  async execute(sql: string, dataSource: DataSource): Promise<SandboxResult> {
    // R1: refuse writable DS before any ffp call.
    if (dataSource.isReadOnly !== true) {
      return { success: false, error: READ_ONLY_REQUIRED_ERROR };
    }

    const host = normalizeDataSourceHost(dataSource.host);
    if (!host) {
      return { success: false, error: EMPTY_HOST_ERROR };
    }
    if (isDeniedHost(host)) {
      return { success: false, error: DENIED_HOST_ERROR };
    }

    const validation = await validateSql(sql);
    if (!validation.ok) {
      return {
        success: false,
        error: mapSandboxError(validation.code, validation.reason),
      };
    }

    const password = this.crypto.decrypt(dataSource.password);
    const { limits } = await sandboxPackageDefaults();
    const image = explicitSandboxImage();

    const result = await this.executeSqlFn({
      sql,
      connection: {
        type: mapDialect(dataSource.type),
        host,
        port: dataSource.port,
        user: dataSource.username,
        password,
        database: dataSource.database,
      },
      hostAllowlist: buildHostAllowlist(host),
      limits: sandboxLimitsFromEnv(limits),
      ...(image ? { image } : {}),
    });

    if (!result.ok) {
      this.logger.warn(`Sandbox SQL failed: code=${result.code} ${result.error}`);
      return {
        success: false,
        error: mapSandboxError(result.code, result.error),
      };
    }
    return { success: true, data: toQueryResult(result.data) };
  }

  async checkDockerAvailable(): Promise<boolean> {
    return this.pingFn();
  }
}
