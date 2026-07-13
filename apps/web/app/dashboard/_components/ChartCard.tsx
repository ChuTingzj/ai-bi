'use client';

import dynamic from 'next/dynamic';
import type { DashboardChartDto } from '@ai-bi/shared';

const ReactECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center text-slate-400">
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
    <div className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium">{chart.title}</h3>
        <button
          onClick={onRemove}
          className="hidden text-sm text-slate-400 hover:text-red-500 group-hover:block"
        >
          移除
        </button>
      </div>
      <ReactECharts option={chart.chartConfig} style={{ height: 300 }} notMerge />
    </div>
  );
}
