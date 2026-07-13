'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageDto, PaginatedDto, SessionDto } from '@ai-bi/shared';
import { api } from '@/lib/api';

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
