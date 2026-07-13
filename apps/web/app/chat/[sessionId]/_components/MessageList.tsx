'use client';

import { useEffect, useRef } from 'react';
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
  streaming,
  onAddToDashboard,
}: {
  messages: MessageDto[];
  streaming: StreamingView | null;
  onAddToDashboard: (config: Record<string, unknown>) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streaming?.content, streaming?.chart]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {messages.length === 0 && !streaming && (
        <div className="mt-24 text-center text-slate-400">
          <p className="text-lg font-medium">开始您的数据探索</p>
          <p className="mt-2 text-sm">
            用自然语言提问，AI 将自动生成 SQL、执行查询并绘制图表
          </p>
        </div>
      )}

      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} onAddToDashboard={onAddToDashboard} />
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

      <div ref={bottomRef} />
    </div>
  );
}
