import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { SseEvent } from '@ai-bi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { LlmService } from './llm.service';
import { buildBiAgentGraph } from './graph/bi-agent.graph';
import { FALLBACK_MESSAGE } from './graph/prompts';
import type { BiAgentState, BenchmarkRunResult } from './graph/state';

export interface WorkflowInput {
  sessionId: string;
  question: string;
  dataSourceId: string;
  userId: string;
  signal?: AbortSignal;
}

function chunkText(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object') return '';
  const content = (chunk as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        return String((part as { text?: unknown }).text ?? '');
      }
      return '';
    })
    .join('');
}

const NODE_NAMES = new Set([
  'planner',
  'schemaFetcher',
  'sqlGenerator',
  'sqlExecutor',
  'chartGenerator',
  'analyst',
  'fallback',
]);

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private compiledGraph: ReturnType<typeof buildBiAgentGraph>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SandboxService) private readonly sandbox: SandboxService,
    @Inject(LlmService) private readonly llm: LlmService,
  ) {}

  async onModuleInit() {
    let checkpointer: PostgresSaver | undefined;
    try {
      checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
      await checkpointer.setup();
    } catch (err) {
      this.logger.warn(
        `Checkpointer setup failed, running without persistence: ${(err as Error).message}`,
      );
      checkpointer = undefined;
    }

    this.compiledGraph = buildBiAgentGraph(
      { prisma: this.prisma, sandbox: this.sandbox, llm: this.llm },
      checkpointer,
    );
  }

  async *invokeWorkflow(input: WorkflowInput): AsyncGenerator<SseEvent> {
    const stream = this.compiledGraph.streamEvents(
      {
        question: input.question,
        data_source_id: input.dataSourceId,
        session_id: input.sessionId,
        error_count: 0,
        sql_result: null,
        sql_error: null,
        chart_config: null,
      },
      {
        version: 'v2' as const,
        signal: input.signal,
        // 每次提问独立 checkpoint，避免上次未跑完的 thread 把新问题卡在半路节点
        configurable: { thread_id: `${input.sessionId}:${randomUUID()}` },
      },
    );

    let retryCount = 0;
    let lastSql = '';
    let lastSqlError = '';

    for await (const event of stream) {
      const nodeName = (event.metadata?.langgraph_node ?? event.name) as string;

      // 节点开始：推送进度状态。用 event.name 避免嵌套 LLM runnable 重复触发
      if (event.event === 'on_chain_start' && NODE_NAMES.has(event.name)) {
        switch (event.name) {
          case 'planner':
            yield { type: 'status', step: 'planning', message: '正在理解您的问题...' };
            break;
          case 'schemaFetcher':
            yield { type: 'status', step: 'fetching_schema', message: '正在检索相关表结构...' };
            break;
          case 'sqlGenerator':
            yield {
              type: 'status',
              step: 'generating_sql',
              message:
                retryCount > 0
                  ? `SQL 执行失败，正在第 ${retryCount} 次重试...`
                  : '正在生成 SQL...',
            };
            break;
          case 'sqlExecutor':
            yield { type: 'status', step: 'executing_sql', message: '正在沙盒中执行 SQL...' };
            break;
          case 'chartGenerator':
            yield { type: 'status', step: 'generating_chart', message: '正在生成图表...' };
            break;
          case 'analyst':
            yield { type: 'status', step: 'analyzing', message: '正在生成业务洞察...' };
            break;
        }
      }

      // 节点结束：推送结果事件
      if (event.event === 'on_chain_end' && NODE_NAMES.has(event.name)) {
        const output = (event.data?.output ?? {}) as Partial<BiAgentState>;

        if (event.name === 'sqlGenerator' && output.generated_sql) {
          lastSql = output.generated_sql;
          yield { type: 'sql', query: output.generated_sql, status: 'generated' };
        }

        if (event.name === 'sqlExecutor') {
          if (output.sql_error) {
            lastSqlError = output.sql_error;
            retryCount = output.error_count ?? retryCount + 1;
            yield { type: 'sql', query: lastSql, status: 'error' };
          } else if (output.sql_result) {
            lastSqlError = '';
            yield { type: 'sql', query: lastSql, status: 'success' };
          }
        }

        if (event.name === 'chartGenerator' && output.chart_config) {
          yield { type: 'chart', config: output.chart_config };
        }

        if (event.name === 'fallback') {
          const detail = lastSqlError ? `\n\n最后一次错误：${lastSqlError}` : '';
          yield { type: 'error', code: '1003', message: FALLBACK_MESSAGE + detail };
        }
      }

      // Analyst 节点内 LLM 流式 token
      if (
        event.event === 'on_chat_model_stream' &&
        nodeName === 'analyst'
      ) {
        const content = chunkText(event.data?.chunk);
        if (content) {
          yield { type: 'token', content };
        }
      }
    }
  }

  /** Benchmark-only: runs workflow and returns structured artifact (no SSE). */
  async runBenchmarkCase(input: WorkflowInput): Promise<BenchmarkRunResult> {
    const startedAt = Date.now();
    const nodeStarts = new Map<string, number>();
    const latencies: Record<string, number> = {};

    let intent: BenchmarkRunResult['intent'] = null;
    let relevant_tables: string[] = [];
    let generated_sql = '';
    let sql_result: BenchmarkRunResult['sql_result'] = null;
    let sql_error: string | null = null;
    let error_count = 0;
    let chart_config: BenchmarkRunResult['chart_config'] = null;
    let analyst_text = '';
    let fallback = false;
    let sql_attempts = 0;

    const stream = this.compiledGraph.streamEvents(
      {
        question: input.question,
        data_source_id: input.dataSourceId,
        session_id: input.sessionId,
        error_count: 0,
        sql_result: null,
        sql_error: null,
        chart_config: null,
      },
      {
        version: 'v2' as const,
        signal: input.signal,
        configurable: { thread_id: `${input.sessionId}:benchmark:${randomUUID()}` },
      },
    );

    for await (const event of stream) {
      const nodeName = (event.metadata?.langgraph_node ?? event.name) as string;

      if (event.event === 'on_chain_start' && NODE_NAMES.has(event.name)) {
        nodeStarts.set(event.name, Date.now());
      }

      if (event.event === 'on_chain_end' && NODE_NAMES.has(event.name)) {
        const start = nodeStarts.get(event.name);
        if (start) latencies[event.name] = Date.now() - start;

        const output = (event.data?.output ?? {}) as Partial<BiAgentState>;

        if (event.name === 'planner') {
          intent = output.intent ?? null;
          relevant_tables = output.relevant_tables ?? [];
        }
        if (event.name === 'sqlGenerator' && output.generated_sql) {
          generated_sql = output.generated_sql;
          sql_attempts += 1;
        }
        if (event.name === 'sqlExecutor') {
          if (output.sql_error) {
            sql_error = output.sql_error;
            error_count = output.error_count ?? error_count + 1;
          } else if (output.sql_result) {
            sql_result = output.sql_result;
            sql_error = null;
          }
        }
        if (event.name === 'chartGenerator' && output.chart_config) {
          chart_config = output.chart_config;
        }
        if (event.name === 'fallback') {
          fallback = true;
        }
      }

      if (event.event === 'on_chat_model_stream' && nodeName === 'analyst') {
        analyst_text += chunkText(event.data?.chunk);
      }
    }

    return {
      intent,
      relevant_tables,
      generated_sql,
      sql_result,
      sql_error,
      error_count,
      chart_config,
      analyst_text,
      fallback,
      sql_attempts,
      latencies_ms: latencies,
      total_latency_ms: Date.now() - startedAt,
    };
  }
}
