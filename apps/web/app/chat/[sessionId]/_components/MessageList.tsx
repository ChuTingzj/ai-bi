'use client';

import type { MessageDto } from '@ai-bi/shared';
import { MessageBubble } from './MessageBubble';

interface StreamingView {
  question: string | null;
  content: string;
  chart: Record<string, unknown> | null;
  sql: string | null;
  error: string | null;
}

export function MessageList({
  messages,
  sessionId,
  streaming,
  emptyHint,
  onAddToDashboard,
}: {
  messages: MessageDto[];
  sessionId: string;
  streaming: StreamingView | null;
  emptyHint?: string;
  onAddToDashboard: (config: Record<string, unknown>) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {messages.length === 0 && !streaming && (
        <div className="mt-24 text-center text-muted-foreground">
          <p className="text-lg font-medium text-foreground">开始您的数据探索</p>
          <p className="mt-2 text-sm">
            {emptyHint ??
              '用自然语言提问，AI 将自动生成 SQL、执行查询并绘制图表。结果可在 SQL Lab 中修改后重跑。'}
          </p>
        </div>
      )}

      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          sessionId={sessionId}
          onAddToDashboard={onAddToDashboard}
        />
      ))}

      {streaming && (
        <>
          {streaming.question && (
            <MessageBubble
              message={{
                id: 'pending-user',
                role: 'USER',
                content: streaming.question,
                createdAt: new Date().toISOString(),
              }}
              onAddToDashboard={onAddToDashboard}
            />
          )}
          {(streaming.content || streaming.chart || streaming.error) && (
            <MessageBubble
              message={{
                id: 'pending-assistant',
                role: 'ASSISTANT',
                content: streaming.error ?? streaming.content,
                chartConfig: streaming.chart,
                sqlQuery: streaming.sql,
                createdAt: new Date().toISOString(),
              }}
              onAddToDashboard={onAddToDashboard}
              isError={!!streaming.error}
            />
          )}
        </>
      )}
    </div>
  );
}
