'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EChartsRenderer } from '@/components/charts/EChartsRenderer';

export function MarkdownRenderer({
  content,
  onAddToDashboard,
}: {
  content: string;
  onAddToDashboard?: (config: Record<string, unknown>) => void;
}) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            if (match?.[1] === 'echarts') {
              try {
                const config = JSON.parse(String(children).replace(/\n$/, ''));
                return (
                  <EChartsRenderer
                    config={config}
                    onAddToDashboard={onAddToDashboard}
                  />
                );
              } catch {
                return (
                  <pre className={className}>
                    <code {...props}>{children}</code>
                  </pre>
                );
              }
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
