'use client';

import { useState } from 'react';
import type { MessageDto } from '@ai-bi/shared';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { EChartsRenderer } from '@/components/charts/EChartsRenderer';

export function MessageBubble({
  message,
  onAddToDashboard,
  isError = false,
}: {
  message: MessageDto;
  onAddToDashboard: (config: Record<string, unknown>) => void;
  isError?: boolean;
}) {
  const [showSql, setShowSql] = useState(false);
  const isUser = message.role === 'USER';

  if (isUser) {
    return (
      <div className="mb-4 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 flex justify-start">
      <div
        className={`w-full max-w-[95%] rounded-2xl rounded-bl-sm border px-4 py-3 ${
          isError
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-slate-200 bg-white'
        }`}
      >
        {message.sqlQuery && (
          <div className="mb-2">
            <button
              onClick={() => setShowSql(!showSql)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              {showSql ? '收起 SQL ▲' : '查看生成的 SQL ▼'}
            </button>
            {showSql && (
              <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-emerald-300">
                {message.sqlQuery}
              </pre>
            )}
          </div>
        )}

        {message.content && (
          <MarkdownRenderer
            content={message.content}
            onAddToDashboard={onAddToDashboard}
          />
        )}

        {message.chartConfig && (
          <EChartsRenderer
            config={message.chartConfig}
            onAddToDashboard={onAddToDashboard}
          />
        )}
      </div>
    </div>
  );
}
