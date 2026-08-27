'use client';

import { CaretDown } from '@phosphor-icons/react';
import type { DataSourceDto, DataSourceType } from '@ai-bi/shared';

const TYPE_LABEL: Record<DataSourceType, string> = {
  POSTGRESQL: 'PostgreSQL',
  MYSQL: 'MySQL',
};

export function dataSourceOptionLabel(ds: DataSourceDto): string {
  return `${ds.name} · ${TYPE_LABEL[ds.type]}`;
}

export function DataSourceSelect({
  dataSources,
  value,
  onChange,
  disabled,
  id = 'data-source-select',
}: {
  dataSources: DataSourceDto[] | undefined;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const selected = dataSources?.find((ds) => ds.id === value);
  const selectedTitle = selected ? dataSourceOptionLabel(selected) : undefined;

  return (
    <label
      htmlFor={id}
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
    >
      数据源
      <span className="relative min-w-0 max-w-[12rem]">
        <select
          id={id}
          className="min-h-11 w-full cursor-pointer appearance-none truncate rounded-lg border border-border bg-card py-1 pl-2 pr-8 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          value={value}
          title={selectedTitle}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">请选择数据源</option>
          {dataSources?.map((ds) => (
            <option key={ds.id} value={ds.id}>
              {dataSourceOptionLabel(ds)}
            </option>
          ))}
        </select>
        <CaretDown
          size={14}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </span>
    </label>
  );
}
