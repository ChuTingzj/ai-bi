'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DataSourceDto,
  MessageDto,
  PaginatedDto,
  SessionDto,
} from '@ai-bi/shared';
import { api } from '@/lib/api';
import { useDataSources } from './useDataSources';

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<SessionDto[]>('/api/sessions'),
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; dataSourceId?: string }) =>
      api.post<SessionDto>('/api/sessions', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useUpdateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; dataSourceId: string }) =>
      api.patch<SessionDto>(`/api/sessions/${input.id}`, {
        dataSourceId: input.dataSourceId,
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['sessions'] });
      const prev = queryClient.getQueryData<SessionDto[]>(['sessions']);
      const dataSources = queryClient.getQueryData<DataSourceDto[]>([
        'datasources',
      ]);
      const dataSourceName = dataSources?.find(
        (ds) => ds.id === input.dataSourceId,
      )?.name;
      queryClient.setQueryData<SessionDto[]>(['sessions'], (list) =>
        list?.map((s) =>
          s.id === input.id
            ? { ...s, dataSourceId: input.dataSourceId, dataSourceName }
            : s,
        ),
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['sessions'], ctx.prev);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<SessionDto[]>(['sessions'], (list) =>
        list?.map((s) => (s.id === updated.id ? updated : s)) ?? list,
      );
    },
  });
}

/** 会话未绑定且用户仅有一个数据源时自动写入 Session.dataSourceId */
export function useAutoBindSessionDataSource(sessionId: string | undefined) {
  const { data: sessions } = useSessions();
  const { data: dataSources } = useDataSources();
  const updateSession = useUpdateSession();
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId || !dataSources) return;
    const session = sessions?.find((s) => s.id === sessionId);
    if (!session || session.dataSourceId) return;
    if (dataSources.length !== 1) return;
    const onlyId = dataSources[0].id;
    const key = `${sessionId}:${onlyId}`;
    if (attempted.current === key) return;
    attempted.current = key;
    updateSession.mutate({ id: sessionId, dataSourceId: onlyId });
  }, [sessionId, sessions, dataSources, updateSession]);
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useMessages(sessionId: string) {
  return useQuery({
    queryKey: ['messages', sessionId],
    queryFn: () =>
      api.get<PaginatedDto<MessageDto>>(
        `/api/sessions/${sessionId}/messages?page=1&limit=100`,
      ),
    enabled: !!sessionId,
  });
}
