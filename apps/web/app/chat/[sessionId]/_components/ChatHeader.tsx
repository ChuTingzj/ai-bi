'use client';

import Link from 'next/link';
import { Database } from '@phosphor-icons/react';
import type { DataSourceDto } from '@ai-bi/shared';
import { DataSourceSelect } from '@/components/datasource/DataSourceSelect';

export function ChatHeader({
  dataSources,
  dataSourceId,
  disabled,
  onChange,
}: {
  dataSources: DataSourceDto[] | undefined;
  dataSourceId: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const selected = dataSources?.find((ds) => ds.id === dataSourceId);
  const hasSources = (dataSources?.length ?? 0) > 0;
  const connected = selected?.connectionStatus === 'CONNECTED';

  return (
    <header className="border-b border-border bg-card px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Database size={16} className="text-muted-foreground" aria-hidden="true" />
        <DataSourceSelect
          id="chat-data-source-select"
          dataSources={dataSources}
          value={dataSourceId}
          onChange={onChange}
          disabled={disabled}
        />
        {selected && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              connected
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-600'
            }`}
          >
            {connected ? '已连接' : '连接异常'}
          </span>
        )}
        {!hasSources && (
          <Link
            href="/admin/datasources"
            className="text-xs font-medium text-primary hover:underline"
          >
            去接入数据源
          </Link>
        )}
      </div>
      {dataSourceId ? (
        <p className="mt-1 text-xs text-muted-foreground">
          之后的问题将查询该数据源
        </p>
      ) : null}
    </header>
  );
}
