import { Inject, Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import type { DataSource } from '@ai-bi/db';
import type { QueryResult, SandboxResult } from '@ai-bi/shared';
import { validateSql } from './sql-validator';
import { CryptoService } from '../common/crypto.service';

const TIMEOUT_MS = parseInt(process.env.SANDBOX_TIMEOUT_MS ?? '10000', 10);
const MEMORY_MB = parseInt(process.env.SANDBOX_MEMORY_MB ?? '128', 10);

/** 沙盒跑在 Docker bridge 网络里，容器内的 127.0.0.1 不是宿主机 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function resolveSandboxDbHost(host: string): string {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase())
    ? 'host.docker.internal'
    : host;
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly docker = new Docker();

  constructor(@Inject(CryptoService) private readonly crypto: CryptoService) {}

  async execute(sql: string, dataSource: DataSource): Promise<SandboxResult> {
    const validation = validateSql(sql);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    let container: Docker.Container | null = null;
    try {
      const dbHost = resolveSandboxDbHost(dataSource.host);
      container = await this.docker.createContainer({
        Image: process.env.SANDBOX_IMAGE ?? 'ai-bi-sandbox:latest',
        Cmd: [sql],
        Env: [
          `DB_TYPE=${dataSource.type}`,
          `DB_HOST=${dbHost}`,
          `DB_PORT=${dataSource.port}`,
          `DB_USER=${dataSource.username}`,
          `DB_PASS=${this.crypto.decrypt(dataSource.password)}`,
          `DB_NAME=${dataSource.database}`,
          `QUERY_TIMEOUT=${TIMEOUT_MS}`,
        ],
        HostConfig: {
          Memory: MEMORY_MB * 1024 * 1024,
          MemorySwap: MEMORY_MB * 1024 * 1024,
          NanoCpus: 0.5 * 1e9,
          // 需要访问目标数据库，使用 bridge；如目标库在宿主机内网，可配置自定义受限网络
          NetworkMode: 'bridge',
          ExtraHosts: ['host.docker.internal:host-gateway'],
          AutoRemove: false,
        },
      });

      await container.start();

      const waitPromise = container.wait();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`SQL 执行超时（${TIMEOUT_MS / 1000}s），已强制终止`)),
          TIMEOUT_MS + 2000,
        ),
      );

      const waitResult = (await Promise.race([waitPromise, timeoutPromise])) as {
        StatusCode: number;
      };

      const logs = await container.logs({ stdout: true, stderr: true });
      const output = this.demuxLogs(logs as Buffer);

      if (waitResult.StatusCode === 0) {
        const data = JSON.parse(output.stdout) as QueryResult;
        return { success: true, data };
      }

      let errorMessage = output.stderr || output.stdout || '沙盒执行失败';
      try {
        errorMessage = (JSON.parse(errorMessage) as { error: string }).error;
      } catch {
        // stderr 非 JSON 时按原文返回
      }
      this.logger.warn(`Sandbox SQL failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } catch (err) {
      this.logger.error(`Sandbox execution failed: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    } finally {
      if (container) {
        try {
          await container.kill();
        } catch {
          // 容器已退出
        }
        try {
          await container.remove({ force: true });
        } catch {
          // 已被移除
        }
      }
    }
  }

  /** Docker 日志流为 multiplexed 格式：8 字节头 + payload */
  private demuxLogs(buffer: Buffer): { stdout: string; stderr: string } {
    let stdout = '';
    let stderr = '';
    let offset = 0;

    while (offset + 8 <= buffer.length) {
      const streamType = buffer[offset];
      const size = buffer.readUInt32BE(offset + 4);
      const payload = buffer
        .subarray(offset + 8, offset + 8 + size)
        .toString('utf8');
      if (streamType === 1) stdout += payload;
      else if (streamType === 2) stderr += payload;
      offset += 8 + size;
    }

    // 非 multiplexed 流（TTY 模式）直接返回全文
    if (!stdout && !stderr) stdout = buffer.toString('utf8');

    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }

  async checkDockerAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }
}
