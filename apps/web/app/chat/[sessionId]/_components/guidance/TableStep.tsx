'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import type { SchemaTableMeta } from '@ai-bi/shared';

export function TableStep({
  tables,
  selected,
  onSelect,
}: {
  tables: SchemaTableMeta[];
  selected: string | null;
  onSelect: (tableName: string) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, query]);

  if (tables.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        当前数据源没有可用表结构，请先在数据源管理中同步 Schema。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor="guidance-table-search">
        搜索表名
      </label>
      <div className="relative">
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="guidance-table-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索表名…"
          className="min-h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <ul className="max-h-56 space-y-1 overflow-y-auto" role="listbox" aria-label="数据表">
        {filtered.map((table) => {
          const isSelected = selected === table.name;
          return (
            <li key={table.name}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(table.name)}
                className={`flex min-h-11 w-full cursor-pointer items-center rounded-lg px-3 py-2 text-left font-mono text-sm transition-colors duration-150 ${
                  isSelected
                    ? 'bg-primary text-on-primary'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <span className="truncate">{table.name}</span>
                <span
                  className={`ml-auto shrink-0 text-xs ${
                    isSelected ? 'text-on-primary/80' : 'text-muted-foreground'
                  }`}
                >
                  {table.columns.length} 列
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-2 py-4 text-sm text-muted-foreground">无匹配表</li>
        )}
      </ul>
    </div>
  );
}
