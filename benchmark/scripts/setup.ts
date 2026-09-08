/**
 * Benchmark environment setup: creates user, datasource, syncs schemaDoc.
 * Run: pnpm benchmark:setup
 */
import { createCipheriv, randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as bcrypt from 'bcryptjs';
import { Client as PgClient } from 'pg';
import { PrismaClient } from '@ai-bi/db';
import {
  buildCheckEnumMap,
  buildDdl,
  buildNativeEnumMap,
  mergeEnumMaps,
  type SchemaColumnRow,
} from '@ai-bi/shared';

// Load .env from project root
const envPath = resolve(__dirname, '../../.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq);
      const val = trimmed.slice(eq + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {
  console.warn('Warning: .env not found, using existing environment variables');
}

const BENCHMARK_EMAIL = 'benchmark@ai-bi.local';
const BENCHMARK_PASSWORD = 'benchmark-pass-123';
const BENCHMARK_DB_HOST = process.env.BENCHMARK_DB_HOST ?? 'localhost';
const BENCHMARK_DB_PORT = parseInt(process.env.BENCHMARK_DB_PORT ?? '5433', 10);

function encrypt(plaintext: string): string {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string');
  }
  const key = Buffer.from(hex, 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function extractSchema(): Promise<string> {
  const client = new PgClient({
    host: BENCHMARK_DB_HOST,
    port: BENCHMARK_DB_PORT,
    user: 'postgres',
    password: 'password',
    database: 'benchmark_bi',
  });
  await client.connect();
  try {
    const { rows } = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      udt_name: string;
    }>(`
      SELECT table_name, column_name, data_type, is_nullable, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    const typedRows: SchemaColumnRow[] = rows.map((r) => ({
      table_name: r.table_name,
      column_name: r.column_name,
      data_type: r.data_type,
      is_nullable: r.is_nullable,
    }));

    const { rows: enumRows } = await client.query<{
      typname: string;
      enumlabel: string;
    }>(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      ORDER BY t.typname, e.enumsortorder
    `);

    const { rows: checkRows } = await client.query<{
      table_name: string;
      check_def: string;
    }>(`
      SELECT
        c.conrelid::regclass::text AS table_name,
        pg_get_constraintdef(c.oid) AS check_def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'c'
        AND n.nspname = 'public'
    `);

    const enumMap = mergeEnumMaps(
      buildNativeEnumMap(rows, enumRows),
      buildCheckEnumMap(checkRows),
    );

    return buildDdl(typedRows, enumMap);
  } finally {
    await client.end();
  }
}

async function main() {
  const prisma = new PrismaClient();

  let user = await prisma.user.findUnique({ where: { email: BENCHMARK_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: BENCHMARK_EMAIL,
        name: 'Benchmark User',
        passwordHash: await bcrypt.hash(BENCHMARK_PASSWORD, 12),
        role: 'USER',
      },
    });
    console.log(`Created benchmark user: ${user.id}`);
  } else {
    console.log(`Reusing benchmark user: ${user.id}`);
  }

  const schemaDoc = await extractSchema();
  console.log(`Extracted schema: ${schemaDoc.split('CREATE TABLE').length - 1} tables`);

  const existing = await prisma.dataSource.findFirst({
    where: { userId: user.id, name: 'Benchmark Ecommerce' },
  });

  let dataSource;
  if (existing) {
    dataSource = await prisma.dataSource.update({
      where: { id: existing.id },
      data: {
        schemaDoc,
        lastSyncAt: new Date(),
        connectionStatus: 'CONNECTED',
        host: BENCHMARK_DB_HOST,
        port: BENCHMARK_DB_PORT,
      },
    });
    console.log(`Updated datasource: ${dataSource.id}`);
  } else {
    dataSource = await prisma.dataSource.create({
      data: {
        userId: user.id,
        name: 'Benchmark Ecommerce',
        type: 'POSTGRESQL',
        host: BENCHMARK_DB_HOST,
        port: BENCHMARK_DB_PORT,
        database: 'benchmark_bi',
        username: 'postgres',
        password: encrypt('password'),
        isReadOnly: true,
        schemaDoc,
        connectionStatus: 'CONNECTED',
        lastSyncAt: new Date(),
      },
    });
    console.log(`Created datasource: ${dataSource.id}`);
  }

  const session = await prisma.session.upsert({
    where: { id: 'benchmark-session-id' },
    create: {
      id: 'benchmark-session-id',
      userId: user.id,
      dataSourceId: dataSource.id,
      title: 'Benchmark Session',
    },
    update: {
      dataSourceId: dataSource.id,
    },
  });

  const envBenchmark = [
    `BENCHMARK_USER_ID=${user.id}`,
    `BENCHMARK_DATASOURCE_ID=${dataSource.id}`,
    `BENCHMARK_SESSION_ID=${session.id}`,
    `BENCHMARK_DB_HOST=${BENCHMARK_DB_HOST}`,
    `BENCHMARK_DB_PORT=${BENCHMARK_DB_PORT}`,
  ].join('\n');

  const outPath = resolve(__dirname, '../.env.benchmark');
  writeFileSync(outPath, envBenchmark + '\n');
  console.log(`\nWrote ${outPath}`);
  console.log(`BENCHMARK_DATASOURCE_ID=${dataSource.id}`);
  console.log(`BENCHMARK_USER_ID=${user.id}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
