'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  useDataSources,
  useCreateDataSource,
  useDeleteDataSource,
  useSyncSchema,
} from '@/hooks/useDataSources';
import { DataSourceForm } from './_components/DataSourceForm';

export default function DataSourcesPage() {
  const { data: dataSources, isLoading } = useDataSources();
  const createDataSource = useCreateDataSource();
  const deleteDataSource = useDeleteDataSource();
  const syncSchema = useSyncSchema();
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState('');

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">数据源管理</h1>
            <p className="text-sm text-muted-foreground">
              接入只读数据库账号，同步表结构后即可开始对话查询
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="min-h-11 cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:opacity-90"
          >
            {showForm ? '取消' : '+ 接入数据源'}
          </button>
        </div>

        {feedback && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {feedback}
          </p>
        )}

        {showForm && (
          <DataSourceForm
            submitting={createDataSource.isPending}
            onSubmit={(values) =>
              createDataSource.mutate(values, {
                onSuccess: (result) => {
                  setFeedback(result.message);
                  setShowForm(false);
                },
                onError: (err) => setFeedback((err as Error).message),
              })
            }
          />
        )}

        {isLoading && <p className="text-muted-foreground">加载中...</p>}

        <div className="space-y-3">
          {dataSources?.map((ds) => (
            <div
              key={ds.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{ds.name}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      ds.connectionStatus === 'CONNECTED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {ds.connectionStatus === 'CONNECTED' ? '已连接' : '连接异常'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {ds.type} · {ds.host}:{ds.port}/{ds.database} · 用户 {ds.username}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ds.lastSyncAt
                    ? `表结构同步于 ${new Date(ds.lastSyncAt).toLocaleString()}`
                    : '尚未同步表结构'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    syncSchema.mutate(ds.id, {
                      onSuccess: (r) =>
                        setFeedback(`同步成功，共 ${r.tableCount} 张表`),
                      onError: (err) => setFeedback((err as Error).message),
                    })
                  }
                  disabled={syncSchema.isPending}
                  className="min-h-11 cursor-pointer rounded-lg border border-border-strong px-3 py-1.5 text-sm text-primary hover:bg-muted disabled:opacity-50"
                >
                  {syncSchema.isPending ? '同步中...' : '同步 Schema'}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`确认删除数据源「${ds.name}」？`)) {
                      deleteDataSource.mutate(ds.id);
                    }
                  }}
                  className="min-h-11 cursor-pointer rounded-lg border border-red-200 px-3 py-1.5 text-sm text-destructive hover:bg-red-50"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
