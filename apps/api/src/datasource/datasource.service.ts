import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Client as PgClient } from 'pg';
import * as mysql from 'mysql2/promise';
import type { DataSource } from '@ai-bi/db';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { CreateDataSourceDto, UpdateDataSourceDto } from './datasource.dto';

@Injectable()
export class DataSourceService {
  private readonly logger = new Logger(DataSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private toDto(ds: DataSource) {
    return {
      id: ds.id,
      name: ds.name,
      type: ds.type,
      host: ds.host,
      port: ds.port,
      database: ds.database,
      username: ds.username,
      isReadOnly: ds.isReadOnly,
      connectionStatus: ds.connectionStatus,
      lastSyncAt: ds.lastSyncAt?.toISOString() ?? null,
      createdAt: ds.createdAt.toISOString(),
    };
  }

  async list(userId: string) {
    const items = await this.prisma.dataSource.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((ds) => this.toDto(ds));
  }

  async create(userId: string, dto: CreateDataSourceDto) {
    const connected = await this.testConnection({
      type: dto.type,
      host: dto.host,
      port: dto.port,
      database: dto.database,
      username: dto.username,
      password: dto.password,
    });

    const ds = await this.prisma.dataSource.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        host: dto.host,
        port: dto.port,
        database: dto.database,
        username: dto.username,
        password: this.crypto.encrypt(dto.password),
        isReadOnly: dto.isReadOnly ?? true,
        connectionStatus: connected ? 'CONNECTED' : 'ERROR',
      },
    });

    return {
      ...this.toDto(ds),
      message: connected ? '连接测试成功' : '已保存，但连接测试失败',
    };
  }

  async update(userId: string, id: string, dto: UpdateDataSourceDto) {
    await this.assertOwner(id, userId);
    const ds = await this.prisma.dataSource.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.host !== undefined && { host: dto.host }),
        ...(dto.port !== undefined && { port: dto.port }),
        ...(dto.database !== undefined && { database: dto.database }),
        ...(dto.username !== undefined && { username: dto.username }),
        ...(dto.password !== undefined && {
          password: this.crypto.encrypt(dto.password),
        }),
        ...(dto.isReadOnly !== undefined && { isReadOnly: dto.isReadOnly }),
      },
    });
    return this.toDto(ds);
  }

  async remove(userId: string, id: string) {
    await this.assertOwner(id, userId);
    await this.prisma.dataSource.delete({ where: { id } });
    return { deleted: true };
  }

  async syncSchema(userId: string, id: string) {
    const ds = await this.assertOwner(id, userId);
    const password = this.crypto.decrypt(ds.password);

    let schemaDoc: string;
    let tableCount: number;

    if (ds.type === 'POSTGRESQL') {
      ({ schemaDoc, tableCount } = await this.extractPostgresSchema(ds, password));
    } else {
      ({ schemaDoc, tableCount } = await this.extractMysqlSchema(ds, password));
    }

    const updated = await this.prisma.dataSource.update({
      where: { id },
      data: {
        schemaDoc,
        lastSyncAt: new Date(),
        connectionStatus: 'CONNECTED',
      },
    });

    return {
      syncedAt: updated.lastSyncAt!.toISOString(),
      tableCount,
      schemaDoc: schemaDoc.slice(0, 2000),
    };
  }

  private async assertOwner(id: string, userId: string) {
    const ds = await this.prisma.dataSource.findUnique({ where: { id } });
    if (!ds) throw new NotFoundException('数据源不存在');
    if (ds.userId !== userId) throw new ForbiddenException('无权访问该数据源');
    return ds;
  }

  private async testConnection(config: {
    type: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }): Promise<boolean> {
    try {
      if (config.type === 'POSTGRESQL') {
        const client = new PgClient({
          host: config.host,
          port: config.port,
          user: config.username,
          password: config.password,
          database: config.database,
          connectionTimeoutMillis: 5000,
        });
        await client.connect();
        await client.query('SELECT 1');
        await client.end();
      } else {
        const conn = await mysql.createConnection({
          host: config.host,
          port: config.port,
          user: config.username,
          password: config.password,
          database: config.database,
          connectTimeout: 5000,
        });
        await conn.query('SELECT 1');
        await conn.end();
      }
      return true;
    } catch (err) {
      this.logger.warn(`Connection test failed: ${(err as Error).message}`);
      return false;
    }
  }

  private async extractPostgresSchema(ds: DataSource, password: string) {
    const client = new PgClient({
      host: ds.host,
      port: ds.port,
      user: ds.username,
      password,
      database: ds.database,
      connectionTimeoutMillis: 5000,
    });
    await client.connect();

    const { rows } = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    await client.end();

    return { schemaDoc: this.buildDdl(rows), tableCount: new Set(rows.map((r: { table_name: string }) => r.table_name)).size };
  }

  private async extractMysqlSchema(ds: DataSource, password: string) {
    const conn = await mysql.createConnection({
      host: ds.host,
      port: ds.port,
      user: ds.username,
      password,
      database: ds.database,
      connectTimeout: 5000,
    });

    const [rows] = await conn.query(
      `SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name,
              DATA_TYPE as data_type, IS_NULLABLE as is_nullable
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [ds.database],
    );
    await conn.end();

    const typedRows = rows as Array<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>;
    return {
      schemaDoc: this.buildDdl(typedRows),
      tableCount: new Set(typedRows.map((r) => r.table_name)).size,
    };
  }

  private buildDdl(
    rows: Array<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>,
  ): string {
    const tables = new Map<string, string[]>();
    for (const row of rows) {
      if (!tables.has(row.table_name)) tables.set(row.table_name, []);
      tables
        .get(row.table_name)!
        .push(
          `  ${row.column_name} ${row.data_type}${row.is_nullable === 'NO' ? ' NOT NULL' : ''}`,
        );
    }

    return Array.from(tables.entries())
      .map(([name, cols]) => `CREATE TABLE ${name} (\n${cols.join(',\n')}\n);`)
      .join('\n\n');
  }
}
