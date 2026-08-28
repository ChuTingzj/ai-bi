'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import type { SchemaTableMeta } from '@ai-bi/shared';
import { columnsForTables } from './guidance-summary';

export function FieldStep({
  tables,
  selectedTable,
  selectedFields,
  onChange,
}: {
  tables: SchemaTableMeta[];
  selectedTable: string;
  selectedFields: string[];
  onChange: (fields: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const columns = useMemo(
    () => columnsForTables(tables, [selectedTable]),
    [tables, selectedTable],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter((c) => c.name.toLowerCase().includes(q));
  }, [columns, query]);

  function toggle(name: string) {
    if (selectedFields.includes(name)) {
      onChange(selectedFields.filter((f) => f !== name));
    } else {
      onChange([...selectedFields, name]);
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
              className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground transition-colors duration-150 hover:bg-background"
            >
              {name}
              <X size={12} aria-hidden="true" />
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
        <ul className="max-h-56 space-y-1 overflow-y-auto" role="group" aria-label="字段列表">
          {filtered.map((col) => {
            const checked = selectedFields.includes(col.name);
            return (
              <li key={col.name}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(col.name)}
                    className="size-4 accent-primary"
                  />
                  <span className="font-mono text-sm text-foreground">{col.name}</span>
                  {col.type && (
                    <span className="ml-auto text-xs text-muted-foreground">{col.type}</span>
                  )}
                </label>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-2 py-4 text-sm text-muted-foreground">无匹配字段</li>
          )}
        </ul>
      )}
    </div>
  );
}
