'use client';

import dynamic from 'next/dynamic';
import { useRef } from 'react';
import type ReactEChartsCore from 'echarts-for-react';

const ReactECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center text-slate-400">
      图表加载中...
    </div>
  ),
});

export function EChartsRenderer({
  config,
  onAddToDashboard,
}: {
  config: Record<string, unknown>;
  onAddToDashboard?: (config: Record<string, unknown>) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);

  function exportPng() {
    const instance = (chartRef.current as ReactEChartsCore | null)?.getEchartsInstance();
    if (!instance) return;
    const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
    const link = document.createElement('a');
    link.download = 'chart.png';
    link.href = url;
    link.click();
  }

  return (
    <div className="group relative my-3 rounded-xl border border-slate-200 bg-white p-2">
      <ReactECharts
        ref={chartRef}
        option={config}
        style={{ height: 380, width: '100%' }}
        notMerge
      />
      <div className="absolute right-3 top-3 hidden gap-2 group-hover:flex">
        <button
          onClick={exportPng}
          className="rounded-md bg-slate-800/80 px-2 py-1 text-xs text-white hover:bg-slate-800"
        >
          导出 PNG
        </button>
        {onAddToDashboard && (
          <button
            onClick={() => onAddToDashboard(config)}
            className="rounded-md bg-blue-600/90 px-2 py-1 text-xs text-white hover:bg-blue-600"
          >
            加入 Dashboard
          </button>
        )}
      </div>
    </div>
  );
}
