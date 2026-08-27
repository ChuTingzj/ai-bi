'use client';

import { useMemo } from 'react';

export interface SchemaTable {
  name: string;
  ddl: string;
}

export function parseSchemaTables(schemaDoc: string): SchemaTable[] {
  return schemaDoc
    .split(/(?=CREATE TABLE)/i)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((ddl) => {
      const match = ddl.match(/CREATE TABLE\s+["'`]?(\w+)["'`]?/i);
      return { name: match?.[1] ?? 'unknown', ddl };
    });
}

export function SchemaBrowser({
  schemaDoc,
  onInsert,
}: {
  schemaDoc: string | null | undefined;
  onInsert: (tableName: string) => void;
}) {
  const tables = useMemo(
    () => (schemaDoc ? parseSchemaTables(schemaDoc) : []),
    [schemaDoc],
  );

  return (
    <aside className="flex h-56 shrink-0 flex-col border-b border-border bg-card lg:h-auto lg:w-56 lg:border-b-0 lg:border-r">
      <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        表结构
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {!schemaDoc && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            请先同步数据源 Schema
          </p>
        )}
        {schemaDoc && tables.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">未解析到数据表</p>
        )}
        {tables.map((table) => (
          <button
            key={table.name}
            type="button"
            title={table.ddl}
            onClick={() => onInsert(table.name)}
            className="mb-1 flex min-h-11 w-full cursor-pointer items-center rounded-lg px-2 py-1.5 text-left font-mono text-xs text-foreground hover:bg-muted"
          >
            {table.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
