'use client';

import dynamic from 'next/dynamic';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChartBar, Table, TextAlignLeft } from '@phosphor-icons/react';
import type { AgentStep, QueryResult } from '@ai-bi/shared';
import { AppShell } from '@/components/layout/AppShell';
import { EChartsRenderer } from '@/components/charts/EChartsRenderer';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { useMessages, useSessions } from '@/hooks/useSessions';
import { useDataSourceDetail, useDataSources } from '@/hooks/useDataSources';
import { streamLabRun } from '@/lib/sse-client';
import { LabToolbar } from './_components/LabToolbar';
import { LabProgress } from './_components/LabProgress';
import { SchemaBrowser } from './_components/SchemaBrowser';
import { ResultTable } from './_components/ResultTable';

const SqlEditor = dynamic(
  () => import('./_components/SqlEditor').then((m) => m.SqlEditor),
  {
    ssr: false,
    loading: () => <div className="h-[200px] flex-1 animate-pulse bg-muted lg:h-auto" />,
  },
);

type ResultTab = 'table' | 'chart' | 'insight';

function LabWorkbench() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const initialSessionId = searchParams.get('sessionId') ?? '';
  const initialMessageId = searchParams.get('messageId') ?? '';

  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messageId, setMessageId] = useState(initialMessageId);
  const [dataSourceId, setDataSourceId] = useState('');
  const [sql, setSql] = useState('');
  const [originalSql, setOriginalSql] = useState('');
  const [tab, setTab] = useState<ResultTab>('table');
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<AgentStep | null>(null);
  const [stepMessage, setStepMessage] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [chart, setChart] = useState<Record<string, unknown> | null>(null);
  const [insight, setInsight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sqlFailed, setSqlFailed] = useState(false);

  const errorRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: sessions } = useSessions();
  const { data: dataSources } = useDataSources();
  const { data: messagesData } = useMessages(sessionId);
  const { data: dataSourceDetail } = useDataSourceDetail(dataSourceId || undefined);

  useEffect(() => {
    setSessionId(initialSessionId);
    setMessageId(initialMessageId);
  }, [initialSessionId, initialMessageId]);

  useEffect(() => {
    const sessionDs = sessions?.find((s) => s.id === sessionId)?.dataSourceId;
    if (sessionDs) {
      setDataSourceId(sessionDs);
      return;
    }
    if (dataSources?.[0]?.id) {
      setDataSourceId((current) => current || dataSources[0].id);
    }
  }, [sessionId, sessions, dataSources]);

  useEffect(() => {
    if (!messageId || !messagesData?.items) return;
    const msg = messagesData.items.find((m) => m.id === messageId);
    if (msg?.sqlQuery != null) {
      setSql(msg.sqlQuery);
      setOriginalSql(msg.sqlQuery);
      if (msg.chartConfig) setChart(msg.chartConfig);
      if (msg.content) setInsight(msg.content);
    }
  }, [messageId, messagesData?.items]);

  const dirty = useMemo(
    () => sql.trim() !== originalSql.trim() && sql.trim().length > 0,
    [sql, originalSql],
  );

  const sourceLabel = useMemo(() => {
    if (!messageId) return '空白工作台';
    const sessionTitle = sessions?.find((s) => s.id === sessionId)?.title;
    return sessionTitle ? `来源：${sessionTitle}` : '来源：对话消息';
  }, [messageId, sessionId, sessions]);

  const insertTable = useCallback((tableName: string) => {
    setSql((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return `SELECT * FROM ${tableName}`;
      return `${prev.replace(/\s*$/, '')} ${tableName}`;
    });
  }, []);

  const run = useCallback(async () => {
    if (running || !sessionId || !dataSourceId || !sql.trim()) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setRunning(true);
    setStep(null);
    setStepMessage('');
    setResult(null);
    setError(null);
    setSqlFailed(false);
    setInsight('');
    setTab('table');

    let nextMessageId = messageId;
    let hadSqlSuccess = false;

    try {
      for await (const event of streamLabRun(
        {
          sessionId,
          sql,
          messageId: messageId || undefined,
          dataSourceId,
        },
        abortRef.current.signal,
      )) {
        switch (event.type) {
          case 'status':
            setStep(event.step);
            setStepMessage(event.message);
            break;
          case 'result':
            setResult(event.data);
            hadSqlSuccess = true;
            break;
          case 'sql':
            if (event.status === 'success') hadSqlSuccess = true;
            if (event.status === 'error') setSqlFailed(true);
            break;
          case 'chart':
            setChart(event.config);
            break;
          case 'token':
            setInsight((prev) => prev + event.content);
            break;
          case 'error':
            setError(event.message);
            if (!hadSqlSuccess) setSqlFailed(true);
            break;
          case 'done':
            if (event.messageId) nextMessageId = event.messageId;
            break;
          case 'intent':
          case 'title':
            break;
        }
      }

      if (nextMessageId && nextMessageId !== messageId) {
        setMessageId(nextMessageId);
        router.replace(`/lab?sessionId=${sessionId}&messageId=${nextMessageId}`);
      }
      if (hadSqlSuccess) {
        setOriginalSql(sql);
        await queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
        setSqlFailed(true);
      }
    } finally {
      setRunning(false);
      setStep(null);
    }
  }, [
    running,
    sessionId,
    dataSourceId,
    sql,
    messageId,
    router,
    queryClient,
  ]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function handleSessionChange(id: string) {
    setSessionId(id);
    setMessageId('');
    setSql('');
    setOriginalSql('');
    setResult(null);
    setChart(null);
    setInsight('');
    const ds = sessions?.find((s) => s.id === id)?.dataSourceId;
    if (ds) setDataSourceId(ds);
    router.replace(id ? `/lab?sessionId=${id}` : '/lab');
  }

  const tabs: { id: ResultTab; label: string; icon: typeof Table }[] = [
    { id: 'table', label: '表格', icon: Table },
    { id: 'chart', label: '图表', icon: ChartBar },
    { id: 'insight', label: '洞察', icon: TextAlignLeft },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LabToolbar
        sessions={sessions}
        dataSources={dataSources}
        sessionId={sessionId}
        dataSourceId={dataSourceId}
        dirty={dirty || Boolean(messagesData?.items.find((m) => m.id === messageId)?.sqlEdited)}
        running={running}
        sourceLabel={sourceLabel}
        onSessionChange={handleSessionChange}
        onDataSourceChange={setDataSourceId}
        onRun={run}
      />

      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="lab-error-title"
          className="border-b border-red-200 bg-red-50 px-4 py-3 outline-none"
        >
          <h2 id="lab-error-title" className="text-sm font-semibold text-destructive">
            {sqlFailed ? 'SQL 未能执行' : '运行出现问题'}
          </h2>
          <p className="mt-1 text-sm text-destructive">{error}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {sqlFailed
              ? '当前对话中的图表与洞察未被覆盖，请修改 SQL 后重试。'
              : '查询结果已保存，可修正后再次运行以刷新图表或洞察。'}
          </p>
        </div>
      )}

      {running && step && <LabProgress step={step} message={stepMessage} />}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <SchemaBrowser
          schemaDoc={dataSourceDetail?.schemaDoc}
          onInsert={insertTable}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SqlEditor
            value={sql}
            onChange={setSql}
            onRun={run}
            disabled={running}
          />

          <div className="flex min-h-[220px] flex-1 flex-col bg-card lg:min-h-0">
            <div className="flex border-b border-border" role="tablist">
              {tabs.map((t) => {
                const Icon = t.icon;
                const selected = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTab(t.id)}
                    className={`flex min-h-11 cursor-pointer items-center gap-1.5 px-4 text-sm transition-colors ${
                      selected
                        ? 'border-b-2 border-primary font-medium text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3" role="tabpanel">
              {tab === 'table' && !result && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  编辑 SQL 后点击运行，结果将显示在这里。打开 Lab 不会自动执行。
                </p>
              )}
              {tab === 'table' && result && <ResultTable data={result} />}
              {tab === 'chart' && chart && <EChartsRenderer config={chart} />}
              {tab === 'chart' && !chart && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  运行成功后将在此生成图表
                </p>
              )}
              {tab === 'insight' && insight && (
                <MarkdownRenderer content={insight} />
              )}
              {tab === 'insight' && !insight && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  运行成功后将在此生成业务洞察
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LabPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-muted-foreground">
            加载 SQL Lab...
          </div>
        }
      >
        <LabWorkbench />
      </Suspense>
    </AppShell>
  );
}
