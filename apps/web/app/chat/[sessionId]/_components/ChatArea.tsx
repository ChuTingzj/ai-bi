'use client';

import { useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_SESSION_TITLE,
  heuristicTitle,
  isGuidanceMessageIntent,
  type AgentStep,
  type GuidancePayload,
  type SchemaTableMeta,
  type SessionDto,
} from '@ai-bi/shared';
import {
  useAutoBindSessionDataSource,
  useMessages,
  useSessions,
  useUpdateSession,
} from '@/hooks/useSessions';
import { useDataSources } from '@/hooks/useDataSources';
import { streamChat } from '@/lib/sse-client';
import { api } from '@/lib/api';
import { ChatHeader } from './ChatHeader';
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
  liveGuidance: {
    originalQuestion: string;
    tables: SchemaTableMeta[];
  } | null;
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
  liveGuidance: null,
};

type Action =
  | { type: 'START'; question: string }
  | { type: 'STATUS'; step: AgentStep; message: string }
  | { type: 'TOKEN'; content: string }
  | { type: 'CHART'; config: Record<string, unknown> }
  | { type: 'SQL'; query: string }
  | {
      type: 'GUIDANCE';
      originalQuestion: string;
      tables: SchemaTableMeta[];
    }
  | { type: 'ERROR'; message: string }
  | { type: 'CLEAR_STREAM' }
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
    case 'GUIDANCE':
      return {
        ...state,
        isStreaming: false,
        liveGuidance: {
          originalQuestion: action.originalQuestion,
          tables: action.tables,
        },
      };
    case 'ERROR':
      return { ...state, error: action.message, isStreaming: false };
    case 'CLEAR_STREAM':
      return {
        ...state,
        isStreaming: false,
        currentStep: null,
        stepMessage: '',
        streamingContent: '',
        streamingChart: null,
        streamingSql: null,
        pendingQuestion: null,
        liveGuidance: null,
      };
    case 'RESET':
      return initialState;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

const STICK_TO_BOTTOM_PX = 96;

export function ChatArea({ sessionId }: { sessionId: string }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const queryClient = useQueryClient();
  const { data: messagesData } = useMessages(sessionId);
  const { data: sessions } = useSessions();
  const { data: dataSources } = useDataSources();
  const updateSession = useUpdateSession();
  useAutoBindSessionDataSource(sessionId);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const current = sessions?.find((s) => s.id === sessionId);
  const boundDataSourceId = current?.dataSourceId ?? '';
  const hasSources = (dataSources?.length ?? 0) > 0;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [sessionId]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = scroller?.firstElementChild;
    if (!scroller || !content) return;

    const pinToBottom = () => {
      if (!stickToBottomRef.current) return;
      scroller.scrollTop = scroller.scrollHeight;
    };

    const observer = new ResizeObserver(pinToBottom);
    observer.observe(content);
    pinToBottom();
    return () => observer.disconnect();
  }, [sessionId]);

  function handleDataSourceChange(id: string) {
    if (!id) return;
    updateSession.mutate({ id: sessionId, dataSourceId: id });
  }

  function patchSessionTitle(title: string) {
    queryClient.setQueryData<SessionDto[]>(['sessions'], (prev) => {
      if (!prev) return prev;
      return prev.map((s) => (s.id === sessionId ? { ...s, title } : s));
    });
  }

  function handleScrollerScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
  }

  async function runStream(
    message: string,
    options?: { afterGuidance?: boolean; guidance?: GuidancePayload },
  ) {
    if (state.isStreaming || !boundDataSourceId) return;

    stickToBottomRef.current = true;
    dispatch({ type: 'START', question: message });
    abortRef.current = new AbortController();

    const hasUserMessage = messagesData?.items?.some((m) => m.role === 'USER');
    if (current?.title === DEFAULT_SESSION_TITLE && !hasUserMessage) {
      patchSessionTitle(heuristicTitle(message));
    }

    let keepError = false;
    try {
      for await (const event of streamChat(
        {
          sessionId,
          message,
          dataSourceId: boundDataSourceId,
          afterGuidance: options?.afterGuidance,
          guidance: options?.guidance,
        },
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
          case 'title':
            patchSessionTitle(event.title);
            void queryClient.invalidateQueries({ queryKey: ['sessions'] });
            break;
          case 'guidance':
            dispatch({
              type: 'GUIDANCE',
              originalQuestion: event.originalQuestion,
              tables: event.tables,
            });
            break;
          case 'intent':
          case 'result':
            break;
          case 'error':
            dispatch({ type: 'ERROR', message: event.message });
            break;
          case 'done':
            break;
          default: {
            const _exhaustive: never = event;
            void _exhaustive;
            break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        keepError = true;
        const raw = (err as Error).message || '请求失败';
        const message = /timeout|BODY_TIMEOUT|terminated|failed to pipe/i.test(raw)
          ? '对话超时或连接中断，请重试'
          : raw;
        dispatch({ type: 'ERROR', message });
      }
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
      // Transport failures leave no assistant row — keep the error banner.
      dispatch({ type: keepError ? 'CLEAR_STREAM' : 'RESET' });
    }
  }

  async function handleSend(message: string) {
    await runStream(message);
  }

  async function handleGuidanceSubmit(
    message: string,
    guidance: GuidancePayload,
  ) {
    await runStream(message, { afterGuidance: true, guidance });
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

  const emptyHint = !hasSources
    ? '请先在「数据源管理」中接入数据源，再开始提问。'
    : !boundDataSourceId
      ? '请先在顶部选择数据源，之后的问题将查询该库。'
      : '用自然语言提问，AI 将自动生成 SQL、执行查询并绘制图表。结果可在 SQL Lab 中修改后重跑。';

  const placeholder = !hasSources
    ? '请先在「数据源管理」中接入数据源'
    : !boundDataSourceId
      ? '请先选择数据源后再提问'
      : '输入问题，例如：对比过去三个月华东区和华南区的销售额趋势';

  const inputDisabled =
    state.isStreaming ||
    !boundDataSourceId ||
    !!state.liveGuidance ||
    !!(messagesData?.items ?? []).some(
      (m) => isGuidanceMessageIntent(m.intent) && !m.intent.completed,
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatHeader
        dataSources={dataSources}
        dataSourceId={boundDataSourceId}
        disabled={state.isStreaming}
        onChange={handleDataSourceChange}
      />
      <div
        ref={scrollerRef}
        onScroll={handleScrollerScroll}
        className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
      >
        <div>
          <MessageList
            messages={messagesData?.items ?? []}
            sessionId={sessionId}
            emptyHint={emptyHint}
            guidanceDisabled={state.isStreaming}
            onGuidanceSubmit={handleGuidanceSubmit}
            streaming={
              state.isStreaming || state.error || state.liveGuidance
                ? {
                    question: state.pendingQuestion,
                    content: state.streamingContent,
                    chart: state.streamingChart,
                    sql: state.streamingSql,
                    error: state.error,
                    guidance: state.liveGuidance,
                  }
                : null
            }
            onAddToDashboard={handleAddToDashboard}
          />
          {state.isStreaming && state.currentStep && (
            <StreamingIndicator step={state.currentStep} message={state.stepMessage} />
          )}
        </div>
      </div>

      <ChatInput
        disabled={inputDisabled}
        placeholder={
          state.liveGuidance ||
          (messagesData?.items ?? []).some(
            (m) => isGuidanceMessageIntent(m.intent) && !m.intent.completed,
          )
            ? '请先完成上方引导步骤'
            : placeholder
        }
        onSend={handleSend}
      />
    </div>
  );
}
