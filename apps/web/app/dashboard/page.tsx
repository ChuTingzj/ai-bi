'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DashboardChartDto } from '@ai-bi/shared';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChartCard } from './_components/ChartCard';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: charts, isLoading } = useQuery({
    queryKey: ['dashboard-charts'],
    queryFn: () => api.get<DashboardChartDto[]>('/api/dashboard/charts'),
  });

  const removeChart = useMutation({
    mutationFn: (id: string) => api.delete(`/api/dashboard/charts/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['dashboard-charts'] }),
  });

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="mb-1 text-2xl font-bold">我的 Dashboard</h1>
        <p className="mb-6 text-sm text-slate-500">
          从对话中收藏的图表会展示在这里
        </p>

        {isLoading && <p className="text-slate-400">加载中...</p>}

        {!isLoading && (!charts || charts.length === 0) && (
          <div className="mt-24 text-center text-slate-400">
            <p>还没有收藏图表</p>
            <p className="mt-1 text-sm">
              在对话中将鼠标悬停在图表上，点击「加入 Dashboard」
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {charts?.map((chart) => (
            <ChartCard
              key={chart.id}
              chart={chart}
              onRemove={() => removeChart.mutate(chart.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
