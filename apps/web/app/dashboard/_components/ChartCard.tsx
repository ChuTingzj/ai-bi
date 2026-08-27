'use client';

import dynamic from 'next/dynamic';
import type { DashboardChartDto } from '@ai-bi/shared';

const ReactECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center text-muted-foreground">
      加载中...
    </div>
  ),
});

export function ChartCard({
  chart,
  onRemove,
}: {
  chart: DashboardChartDto;
  onRemove: () => void;
}) {
  return (
    <div className="group rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium text-foreground">{chart.title}</h3>
        <button
          onClick={onRemove}
          className="hidden min-h-11 cursor-pointer text-sm text-muted-foreground hover:text-destructive group-hover:block"
        >
          移除
        </button>
      </div>
      <ReactECharts option={chart.chartConfig} style={{ height: 300 }} notMerge />
    </div>
  );
}
