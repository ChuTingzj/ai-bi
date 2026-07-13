/**
 * SQL 沙盒执行脚本。
 * 在隔离容器内运行：接收 SQL（argv[2]），连接目标只读数据库执行，
 * 结果以 JSON 输出到 stdout，错误输出到 stderr。
 */
const sql = process.argv[2];
const timeout = parseInt(process.env.QUERY_TIMEOUT || '10000', 10);
const dbType = (process.env.DB_TYPE || 'POSTGRESQL').toUpperCase();

if (!sql) {
  console.error(JSON.stringify({ error: 'No SQL provided' }));
  process.exit(1);
}

async function runPostgres() {
  const { Client } = require('pg');
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    statement_timeout: timeout,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  const result = await client.query(sql);
  await client.end();
  return {
    columns: result.fields.map((f) => f.name),
    rows: result.rows,
    rowCount: result.rowCount ?? result.rows.length,
  };
}

async function runMysql() {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 5000,
  });
  const [rows, fields] = await conn.query({ sql, timeout });
  await conn.end();
  return {
    columns: (fields || []).map((f) => f.name),
    rows: Array.isArray(rows) ? rows : [],
    rowCount: Array.isArray(rows) ? rows.length : 0,
  };
}

(async () => {
  const result = dbType === 'MYSQL' ? await runMysql() : await runPostgres();
  console.log(JSON.stringify(result));
  process.exit(0);
})().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
