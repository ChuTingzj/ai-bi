'use client';

import { useMemo } from 'react';
import { Plus, Trash } from '@phosphor-icons/react';
import type { GuidanceFilter, SchemaTableMeta } from '@ai-bi/shared';
import {
  FILTER_OPERATORS,
  columnsForTables,
  operatorNeedsValue,
  qualifyField,
} from './guidance-summary';

function emptyFilter(defaultField = ''): GuidanceFilter {
  return { field: defaultField, operator: '=', value: '' };
}

export function FilterStep({
  tables,
  selectedTables,
  selectedFields,
  filters,
  onChange,
}: {
  tables: SchemaTableMeta[];
  selectedTables: string[];
  selectedFields: string[];
  filters: GuidanceFilter[];
  onChange: (filters: GuidanceFilter[]) => void;
}) {
  const columns = useMemo(
    () => columnsForTables(tables, selectedTables),
    [tables, selectedTables],
  );

  const fieldGroups = useMemo(() => {
    if (selectedFields.length > 0) {
      const byTable = new Map<string, string[]>();
      for (const field of selectedFields) {
        const dot = field.indexOf('.');
        const table = dot >= 0 ? field.slice(0, dot) : selectedTables[0] ?? '';
        const col = dot >= 0 ? field.slice(dot + 1) : field;
        const qualified = qualifyField(table, col);
        if (!byTable.has(table)) byTable.set(table, []);
        byTable.get(table)!.push(qualified);
      }
      return [...byTable.entries()];
    }

    const byTable = new Map<string, string[]>();
    for (const col of columns) {
      const qualified = qualifyField(col.table, col.name);
      if (!byTable.has(col.table)) byTable.set(col.table, []);
      byTable.get(col.table)!.push(qualified);
    }
    return [...byTable.entries()];
  }, [columns, selectedFields, selectedTables]);

  const allOptions = fieldGroups.flatMap(([, opts]) => opts);

  function update(index: number, patch: Partial<GuidanceFilter>) {
    onChange(
      filters.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  }

  function remove(index: number) {
    onChange(filters.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...filters, emptyFilter(allOptions[0] ?? '')]);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">过滤条件可选，可直接开始查询。</p>

      {filters.map((filter, index) => {
        const needsValue = operatorNeedsValue(filter.operator);
        return (
          <div
            key={index}
            className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/40 p-2"
          >
            <div className="min-w-[8rem] flex-1">
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`g-field-${index}`}>
                字段
              </label>
              <select
                id={`g-field-${index}`}
                value={filter.field}
                onChange={(e) => update(index, { field: e.target.value })}
                className="min-h-11 w-full rounded-md border border-border bg-background px-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {allOptions.length === 0 && <option value="">（无字段）</option>}
                {fieldGroups.map(([tableName, opts]) => (
                  <optgroup key={tableName} label={tableName}>
                    {opts.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="w-28">
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`g-op-${index}`}>
                运算符
              </label>
              <select
                id={`g-op-${index}`}
                value={filter.operator}
                onChange={(e) =>
                  update(index, {
                    operator: e.target.value as GuidanceFilter['operator'],
                  })
                }
                className="min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {FILTER_OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>

            {needsValue && (
              <div className="min-w-[8rem] flex-1">
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`g-val-${index}`}>
                  值
                </label>
                <input
                  id={`g-val-${index}`}
                  type="text"
                  value={filter.value ?? ''}
                  onChange={(e) => update(index, { value: e.target.value })}
                  placeholder="过滤值"
                  className="min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => remove(index)}
              className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-destructive"
              aria-label={`删除条件 ${index + 1}`}
            >
              <Trash size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        disabled={allOptions.length === 0}
        className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm text-primary transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={16} aria-hidden="true" />
        添加条件
      </button>
    </div>
  );
}
