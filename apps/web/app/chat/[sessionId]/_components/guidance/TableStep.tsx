'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { relatedTablesFor, type SchemaTableMeta } from '@ai-bi/shared';

export function TableStep({
  tables,
  selected,
  related,
  onSelectPrimary,
  onChangeRelated,
}: {
  tables: SchemaTableMeta[];
  selected: string | null;
  related: string[];
  onSelectPrimary: (tableName: string) => void;
  onChangeRelated: (related: string[]) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, query]);

  const relatedCandidates = useMemo(
    () => (selected ? relatedTablesFor(tables, selected) : []),
    [tables, selected],
  );

  const relatedSet = useMemo(
    () => new Set(related.map((t) => t.toLowerCase())),
    [related],
  );

  function toggleRelated(tableName: string) {
    const key = tableName.toLowerCase();
    if (relatedSet.has(key)) {
      onChangeRelated(related.filter((t) => t.toLowerCase() !== key));
    } else {
      onChangeRelated([...related, tableName]);
    }
  }

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
                onClick={() => onSelectPrimary(table.name)}
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

      {selected && relatedCandidates.length > 0 && (
        <fieldset className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 space-y-2 border-t border-border pt-3">
          <legend className="px-0 text-sm font-medium text-foreground">
            可关联表（可选）
          </legend>
          <p className="text-xs text-muted-foreground">
            根据外键自动关联，可多选
          </p>

          {related.length > 0 && (
            <div className="chip-list flex flex-wrap gap-1.5" aria-label="已选关联表">
              {related.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleRelated(name)}
                  className="inline-flex min-h-8 min-w-0 cursor-pointer items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground transition-colors duration-150 hover:bg-background"
                >
                  <span className="min-w-0 truncate">{name}</span>
                  <X size={12} className="shrink-0" aria-hidden="true" />
                  <span className="sr-only">移除关联 {name}</span>
                </button>
              ))}
            </div>
          )}

          <ul
            className="max-h-40 space-y-1 overflow-y-auto"
            role="group"
            aria-label="可关联表列表"
          >
            {relatedCandidates.map((candidate) => {
              const checked = relatedSet.has(candidate.table.toLowerCase());
              return (
                <li key={candidate.table}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRelated(candidate.table)}
                      className="size-4 accent-primary"
                    />
                    <span className="min-w-0 truncate font-mono text-sm text-foreground">
                      {candidate.table}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      via {candidate.hint}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
    </div>
  );
}
