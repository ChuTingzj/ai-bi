'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DataSourceDto } from '@ai-bi/shared';
import { api } from '@/lib/api';

export function useDataSources() {
  return useQuery({
    queryKey: ['datasources'],
    queryFn: () => api.get<DataSourceDto[]>('/api/datasources'),
  });
}

export function useDataSourceDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['datasources', id],
    queryFn: () => api.get<DataSourceDto>(`/api/datasources/${id}`),
    enabled: !!id,
  });
}

export function useCreateDataSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: object) =>
      api.post<DataSourceDto & { message: string }>('/api/datasources', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasources'] }),
  });
}

export function useDeleteDataSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/datasources/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasources'] }),
  });
}

export function useSyncSchema() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ syncedAt: string; tableCount: number }>(
        `/api/datasources/${id}/sync-schema`,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasources'] }),
  });
}
