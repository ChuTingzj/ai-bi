'use client';

import { Play } from '@phosphor-icons/react';
import type { DataSourceDto, SessionDto } from '@ai-bi/shared';
import { DataSourceSelect } from '@/components/datasource/DataSourceSelect';

export function LabToolbar({
  sessions,
  dataSources,
  sessionId,
  dataSourceId,
  dirty,
  running,
  sourceLabel,
  onSessionChange,
  onDataSourceChange,
  onRun,
}: {
  sessions: SessionDto[] | undefined;
  dataSources: DataSourceDto[] | undefined;
  sessionId: string;
  dataSourceId: string;
  dirty: boolean;
  running: boolean;
  sourceLabel: string | null;
  onSessionChange: (id: string) => void;
  onDataSourceChange: (id: string) => void;
  onRun: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        会话
        <select
          className="min-h-11 cursor-pointer rounded-lg border border-border bg-card px-2 py-1 text-sm text-foreground"
          value={sessionId}
          onChange={(e) => onSessionChange(e.target.value)}
          disabled={running}
        >
          <option value="">请选择会话</option>
          {sessions?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>

      <DataSourceSelect
        id="lab-data-source-select"
        dataSources={dataSources}
        value={dataSourceId}
        onChange={onDataSourceChange}
        disabled={running}
      />

      {sourceLabel && (
        <span className="truncate text-xs text-muted-foreground">{sourceLabel}</span>
      )}
      {dirty && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-accent">
          已修改
        </span>
      )}

      <button
        type="button"
        onClick={onRun}
        disabled={running || !sessionId || !dataSourceId}
        className="ml-auto flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:opacity-90 disabled:opacity-40"
      >
        <Play size={16} weight="fill" aria-hidden="true" />
        {running ? '运行中...' : '运行'}
        <kbd className="ml-1 hidden rounded border border-white/30 px-1 text-[10px] sm:inline">
          ⌘↵
        </kbd>
      </button>
    </header>
  );
}
