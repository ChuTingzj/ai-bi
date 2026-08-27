'use client';

import type { AgentStep } from '@ai-bi/shared';

const STEPS: { key: AgentStep; label: string }[] = [
  { key: 'executing_sql', label: '沙盒执行' },
  { key: 'generating_chart', label: '生成图表' },
  { key: 'analyzing', label: '业务洞察' },
];

export function LabProgress({
  step,
  message,
}: {
  step: AgentStep;
  message: string;
}) {
  const currentIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.key === step),
  );

  return (
    <div
      className="border-b border-border-strong bg-muted px-4 py-2"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex shrink-0 items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                i < currentIndex
                  ? 'bg-emerald-100 text-emerald-700'
                  : i === currentIndex
                    ? 'animate-pulse bg-primary text-on-primary'
                    : 'bg-card text-muted-foreground'
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="text-muted-foreground" aria-hidden="true">
                →
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-primary">{message}</p>
    </div>
  );
}
