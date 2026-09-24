import type { SchemaColumn } from './types';

/** Table, column, and type only. No nullability, enums, keys, or sample rows. */
export const SCHEMA_COLUMNS_SQL = `
SELECT c.table_name, c.column_name, c.data_type
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY c.table_name, c.ordinal_position
`;

export function formatSchemaDump(columns: SchemaColumn[]): string {
  const tables: { name: string; lines: string[] }[] = [];
  const index = new Map<string, number>();
  for (const col of columns) {
    let at = index.get(col.table_name);
    if (at === undefined) {
      at = tables.length;
      index.set(col.table_name, at);
      tables.push({ name: col.table_name, lines: [] });
    }
    tables[at].lines.push(`  ${col.column_name} ${col.data_type}`);
  }
  return tables.map((table) => `${table.name}\n${table.lines.join('\n')}`).join('\n');
}

export interface SchemaQueryClient {
  query: (sql: string) => Promise<{ rows: SchemaColumn[] }>;
}

export async function loadSchemaColumns(
  client: SchemaQueryClient,
): Promise<SchemaColumn[]> {
  const { rows } = await client.query(SCHEMA_COLUMNS_SQL);
  return rows.map((row) => ({
    table_name: row.table_name,
    column_name: row.column_name,
    data_type: row.data_type,
  }));
}
