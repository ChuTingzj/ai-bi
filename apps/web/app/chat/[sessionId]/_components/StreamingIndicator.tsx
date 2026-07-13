'use client';

import type { AgentStep } from '@ai-bi/shared';

const STEPS: { key: AgentStep; label: string }[] = [
  { key: 'planning', label: '理解问题' },
  { key: 'fetching_schema', label: '检索表结构' },
  { key: 'generating_sql', label: '生成 SQL' },
  { key: 'executing_sql', label: '沙盒执行' },
  { key: 'generating_chart', label: '生成图表' },
  { key: 'analyzing', label: '业务洞察' },
];

export function StreamingIndicator({
  step,
  message,
}: {
  step: AgentStep;
  message: string;
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex shrink-0 items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  i < currentIndex
                    ? 'bg-emerald-100 text-emerald-700'
                    : i === currentIndex
                      ? 'animate-pulse bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-blue-600">{message}</p>
      </div>
    </div>
  );
}
