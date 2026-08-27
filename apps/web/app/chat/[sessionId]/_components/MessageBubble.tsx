'use client';

import Link from 'next/link';
import { Copy, Code } from '@phosphor-icons/react';
import { useState } from 'react';
import type { MessageDto } from '@ai-bi/shared';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { EChartsRenderer } from '@/components/charts/EChartsRenderer';

export function MessageBubble({
  message,
  sessionId,
  onAddToDashboard,
  isError = false,
}: {
  message: MessageDto;
  sessionId?: string;
  onAddToDashboard: (config: Record<string, unknown>) => void;
  isError?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'USER';
  const sqlLineCount = message.sqlQuery
    ? message.sqlQuery.split('\n').length
    : 0;
  const canOpenLab = Boolean(sessionId && message.sqlQuery && !message.id.startsWith('pending-'));

  async function copySql() {
    if (!message.sqlQuery) return;
    await navigator.clipboard.writeText(message.sqlQuery);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (isUser) {
    return (
      <div className="mb-4 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-on-primary">
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
            ? 'border-red-200 bg-red-50 text-destructive'
            : 'border-border bg-card'
        }`}
      >
        {message.sqlQuery && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
            <Code size={16} className="text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">
              SQL · {sqlLineCount} 行
            </span>
            {message.sqlEdited && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-accent">
                已修改
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={copySql}
                className="flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Copy size={14} aria-hidden="true" />
                {copied ? '已复制' : '复制'}
              </button>
              {canOpenLab && (
                <Link
                  href={`/lab?sessionId=${sessionId}&messageId=${message.id}`}
                  className="flex min-h-11 cursor-pointer items-center rounded-md px-2 text-xs font-medium text-primary hover:underline"
                >
                  在 SQL Lab 打开
                </Link>
              )}
            </div>
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
