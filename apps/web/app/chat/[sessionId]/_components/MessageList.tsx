'use client';

import type { GuidancePayload, MessageDto } from '@ai-bi/shared';
import { MessageBubble } from './MessageBubble';

interface StreamingView {
  question: string | null;
  content: string;
  chart: Record<string, unknown> | null;
  sql: string | null;
  error: string | null;
  guidance?: {
    originalQuestion: string;
    tables: import('@ai-bi/shared').SchemaTableMeta[];
  } | null;
}

export function MessageList({
  messages,
  sessionId,
  streaming,
  emptyHint,
  guidanceDisabled,
  onAddToDashboard,
  onGuidanceSubmit,
}: {
  messages: MessageDto[];
  sessionId: string;
  streaming: StreamingView | null;
  emptyHint?: string;
  guidanceDisabled?: boolean;
  onAddToDashboard: (config: Record<string, unknown>) => void;
  onGuidanceSubmit?: (message: string, guidance: GuidancePayload) => void;
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
          guidanceDisabled={guidanceDisabled}
          onGuidanceSubmit={onGuidanceSubmit}
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
          {(streaming.content ||
            streaming.chart ||
            streaming.error ||
            streaming.guidance) && (
            <MessageBubble
              message={{
                id: 'pending-assistant',
                role: 'ASSISTANT',
                content: streaming.error ?? streaming.content,
                chartConfig: streaming.chart,
                sqlQuery: streaming.sql,
                intent: streaming.guidance
                  ? {
                      kind: 'guidance',
                      originalQuestion: streaming.guidance.originalQuestion,
                      tables: streaming.guidance.tables,
                      completed: false,
                    }
                  : null,
                createdAt: new Date().toISOString(),
              }}
              onAddToDashboard={onAddToDashboard}
              isError={!!streaming.error}
              guidanceDisabled={guidanceDisabled}
              onGuidanceSubmit={onGuidanceSubmit}
            />
          )}
        </>
      )}
    </div>
  );
}
