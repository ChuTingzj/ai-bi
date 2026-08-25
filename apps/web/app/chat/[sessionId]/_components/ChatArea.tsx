'use client';

import { useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AgentStep } from '@ai-bi/shared';
import { useMessages } from '@/hooks/useSessions';
import { useDataSources } from '@/hooks/useDataSources';
import { streamChat } from '@/lib/sse-client';
import { api } from '@/lib/api';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { StreamingIndicator } from './StreamingIndicator';

interface ChatStreamState {
  isStreaming: boolean;
  currentStep: AgentStep | null;
  stepMessage: string;
  streamingContent: string;
  streamingChart: Record<string, unknown> | null;
  streamingSql: string | null;
  pendingQuestion: string | null;
  error: string | null;
}

const initialState: ChatStreamState = {
  isStreaming: false,
  currentStep: null,
  stepMessage: '',
  streamingContent: '',
  streamingChart: null,
  streamingSql: null,
  pendingQuestion: null,
  error: null,
};

type Action =
  | { type: 'START'; question: string }
  | { type: 'STATUS'; step: AgentStep; message: string }
  | { type: 'TOKEN'; content: string }
  | { type: 'CHART'; config: Record<string, unknown> }
  | { type: 'SQL'; query: string }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' };

function reducer(state: ChatStreamState, action: Action): ChatStreamState {
  switch (action.type) {
    case 'START':
      return { ...initialState, isStreaming: true, pendingQuestion: action.question };
    case 'STATUS':
      return { ...state, currentStep: action.step, stepMessage: action.message };
    case 'TOKEN':
      return { ...state, streamingContent: state.streamingContent + action.content };
    case 'CHART':
      return { ...state, streamingChart: action.config };
    case 'SQL':
      return { ...state, streamingSql: action.query };
    case 'ERROR':
      return { ...state, error: action.message, isStreaming: false };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function ChatArea({ sessionId }: { sessionId: string }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const queryClient = useQueryClient();
  const { data: messagesData } = useMessages(sessionId);
  const { data: dataSources } = useDataSources();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const defaultDataSourceId = dataSources?.[0]?.id;

  async function handleSend(message: string) {
    if (state.isStreaming) return;

    dispatch({ type: 'START', question: message });
    abortRef.current = new AbortController();

    try {
      for await (const event of streamChat(
        sessionId,
        message,
        defaultDataSourceId,
        abortRef.current.signal,
      )) {
        switch (event.type) {
          case 'status':
            dispatch({ type: 'STATUS', step: event.step, message: event.message });
            break;
          case 'token':
            dispatch({ type: 'TOKEN', content: event.content });
            break;
          case 'chart':
            dispatch({ type: 'CHART', config: event.config });
            break;
          case 'sql':
            if (event.status === 'generated') {
              dispatch({ type: 'SQL', query: event.query });
            }
            break;
          case 'error':
            dispatch({ type: 'ERROR', message: event.message });
            break;
          case 'done':
            break;
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        dispatch({ type: 'ERROR', message: (err as Error).message });
      }
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
      dispatch({ type: 'RESET' });
    }
  }

  async function handleAddToDashboard(config: Record<string, unknown>) {
    const title =
      ((config.title as Record<string, unknown>)?.text as string) ?? '未命名图表';
    await api.post('/api/dashboard/charts', {
      title,
      chartConfig: config,
      position: { x: 0, y: 0, w: 6, h: 4 },
    });
    alert('已加入 Dashboard');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <MessageList
          messages={messagesData?.items ?? []}
          streaming={
            state.isStreaming || state.error
              ? {
                  question: state.pendingQuestion,
                  content: state.streamingContent,
                  chart: state.streamingChart,
                  sql: state.streamingSql,
                  error: state.error,
                }
              : null
          }
          onAddToDashboard={handleAddToDashboard}
        />
        {state.isStreaming && state.currentStep && (
          <StreamingIndicator step={state.currentStep} message={state.stepMessage} />
        )}
      </div>

      <ChatInput
        disabled={state.isStreaming || !defaultDataSourceId}
        placeholder={
          !defaultDataSourceId
            ? '请先在「数据源管理」中接入数据源'
            : '输入问题，例如：对比过去三个月华东区和华南区的销售额趋势'
        }
        onSend={handleSend}
      />
    </div>
  );
}
