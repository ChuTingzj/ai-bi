'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import type { SchemaTableMeta } from '@ai-bi/shared';
import { columnsForTables, qualifyField } from './guidance-summary';

export function FieldStep({
  tables,
  selectedTables,
  primaryTable,
  selectedFields,
  onChange,
}: {
  tables: SchemaTableMeta[];
  selectedTables: string[];
  primaryTable: string;
  selectedFields: string[];
  onChange: (fields: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const columns = useMemo(
    () => columnsForTables(tables, selectedTables),
    [tables, selectedTables],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.table.toLowerCase().includes(q) ||
        qualifyField(c.table, c.name).toLowerCase().includes(q),
    );
  }, [columns, query]);

  const grouped = useMemo(() => {
    const order = selectedTables.map((t) => t.toLowerCase());
    const map = new Map<string, typeof columns>();
    for (const col of filtered) {
      const key = col.table;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(col);
    }
    return [...map.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0].toLowerCase());
      const bi = order.indexOf(b[0].toLowerCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [filtered, selectedTables]);

  function toggle(qualified: string) {
    if (selectedFields.includes(qualified)) {
      onChange(selectedFields.filter((f) => f !== qualified));
    } else {
      onChange([...selectedFields, qualified]);
    }
  }

  return (
    <div className="space-y-3">
      {selectedFields.length > 0 && (
        <div className="chip-list flex flex-wrap gap-1.5" aria-label="已选字段">
          {selectedFields.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className="inline-flex min-h-8 min-w-0 cursor-pointer items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground transition-colors duration-150 hover:bg-background"
            >
              <span className="min-w-0 truncate">{name}</span>
              <X size={12} className="shrink-0" aria-hidden="true" />
              <span className="sr-only">移除 {name}</span>
            </button>
          ))}
        </div>
      )}

      <label className="sr-only" htmlFor="guidance-field-search">
        搜索字段
      </label>
      <div className="relative">
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="guidance-field-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索字段…"
          className="min-h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {columns.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          该表没有解析到字段，仍可跳过此步继续。
        </p>
      ) : (
        <div className="max-h-56 space-y-3 overflow-y-auto" role="group" aria-label="字段列表">
          {grouped.map(([tableName, cols]) => (
            <div key={tableName}>
              <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">
                {tableName}
                {tableName.toLowerCase() === primaryTable.toLowerCase()
                  ? ' · 主表'
                  : ''}
              </p>
              <ul className="space-y-1">
                {cols.map((col) => {
                  const qualified = qualifyField(col.table, col.name);
                  const checked = selectedFields.includes(qualified);
                  return (
                    <li key={qualified}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(qualified)}
                          className="size-4 accent-primary"
                        />
                        <span className="font-mono text-sm text-foreground">
                          {col.name}
                        </span>
                        {col.type && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            {col.type}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {grouped.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted-foreground">无匹配字段</p>
          )}
        </div>
      )}
    </div>
  );
}
