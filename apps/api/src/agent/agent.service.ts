import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type {
  GuidancePayload,
  QueryIntent,
  QueryResult,
  SseEvent,
} from '@ai-bi/shared';
import { parseSchemaDoc } from '@ai-bi/shared';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { LlmService } from './llm.service';
import { buildBiAgentGraph } from './graph/bi-agent.graph';
import {
  ANALYST_SYSTEM_PROMPT,
  FALLBACK_MESSAGE,
  GUIDANCE_FAIL_MESSAGE,
  GUIDANCE_INTRO_MESSAGE,
} from './graph/prompts';
import { createNodes } from './graph/nodes';
import type { BiAgentState, BenchmarkRunResult } from './graph/state';
import { withLlmRetry } from './llm-retry';

export interface WorkflowInput {
  sessionId: string;
  question: string;
  dataSourceId: string;
  userId: string;
  signal?: AbortSignal;
  afterGuidance?: boolean;
  guidance?: GuidancePayload;
}

export interface LabRerunInput {
  sql: string;
  dataSourceId: string;
  sessionId: string;
  question: string;
  intent: QueryIntent | null;
  signal?: AbortSignal;
}

export interface LabRerunResult {
  sqlResult: QueryResult | null;
  sqlError: string | null;
  truncated: boolean;
  chartConfig: Record<string, unknown> | null;
  chartError: string | null;
  analystText: string;
  analystError: string | null;
}

const RESULT_ROW_LIMIT = 1000;

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
  'guidanceExit',
  'intentFailExit',
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
        after_guidance: input.afterGuidance ?? false,
        guidance: input.guidance ?? null,
        schema_doc: '',
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
    let lastSchemaDoc = '';
    let lastQuestion = input.question;

    for await (const event of stream) {
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

        if (event.name === 'planner') {
          if (output.schema_doc) lastSchemaDoc = output.schema_doc;
          if (output.intent) {
            yield { type: 'intent', intent: output.intent };
          }
        }

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

        if (event.name === 'analyst' && output.analyst_text) {
          yield { type: 'token', content: output.analyst_text };
        }

        if (event.name === 'fallback') {
          const detail = lastSqlError ? `\n\n最后一次错误：${lastSqlError}` : '';
          yield { type: 'error', code: '1003', message: FALLBACK_MESSAGE + detail };
        }

        if (event.name === 'guidanceExit') {
          const schemaDoc =
            lastSchemaDoc ||
            (
              await this.prisma.dataSource.findUnique({
                where: { id: input.dataSourceId },
                select: { schemaDoc: true },
              })
            )?.schemaDoc ||
            '';
          yield {
            type: 'guidance',
            originalQuestion: lastQuestion,
            tables: parseSchemaDoc(schemaDoc),
          };
          // Intro text also flows as token so chat can show copy immediately
          yield { type: 'token', content: GUIDANCE_INTRO_MESSAGE };
        }

        if (event.name === 'intentFailExit') {
          yield {
            type: 'error',
            code: '1005',
            message: GUIDANCE_FAIL_MESSAGE,
          };
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
    let guidance_triggered = false;
    let intent_fail = false;
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
        after_guidance: input.afterGuidance ?? false,
        guidance: input.guidance ?? null,
        schema_doc: '',
      },
      {
        version: 'v2' as const,
        signal: input.signal,
        configurable: { thread_id: `${input.sessionId}:benchmark:${randomUUID()}` },
      },
    );

    for await (const event of stream) {
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
        if (event.name === 'analyst' && output.analyst_text) {
          analyst_text = output.analyst_text;
        }
        if (event.name === 'fallback') {
          fallback = true;
        }
        if (event.name === 'guidanceExit') {
          guidance_triggered = true;
        }
        if (event.name === 'intentFailExit') {
          intent_fail = true;
        }
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
      guidance_triggered,
      intent_fail,
      sql_attempts,
      latencies_ms: latencies,
      total_latency_ms: Date.now() - startedAt,
    };
  }

  async *rerunFromSql(input: LabRerunInput): AsyncGenerator<SseEvent, LabRerunResult> {
    const empty: LabRerunResult = {
      sqlResult: null,
      sqlError: null,
      truncated: false,
      chartConfig: null,
      chartError: null,
      analystText: '',
      analystError: null,
    };

    const nodes = createNodes({
      prisma: this.prisma,
      sandbox: this.sandbox,
      llm: this.llm,
    });

    const baseState: BiAgentState = {
      question: input.question,
      intent: input.intent,
      relevant_tables: input.intent?.relevant_tables ?? [],
      table_schema: '',
      generated_sql: input.sql,
      sql_result: null,
      sql_error: null,
      chart_config: null,
      error_count: 0,
      data_source_id: input.dataSourceId,
      session_id: input.sessionId,
      analyst_text: '',
      after_guidance: false,
      guidance: null,
      schema_doc: '',
    };

    yield { type: 'status', step: 'executing_sql', message: '正在沙盒中执行 SQL...' };
    yield { type: 'sql', query: input.sql, status: 'executing' };

    const exec = await nodes.sqlExecutorNode(baseState);
    if (exec.sql_error || !exec.sql_result) {
      const sqlError = exec.sql_error ?? '未知错误';
      yield { type: 'sql', query: input.sql, status: 'error' };
      yield { type: 'error', code: '1001', message: sqlError };
      return { ...empty, sqlError };
    }

    const truncated =
      exec.sql_result.rows.length > RESULT_ROW_LIMIT ||
      exec.sql_result.rowCount > RESULT_ROW_LIMIT;
    const sqlResult: QueryResult = {
      columns: exec.sql_result.columns,
      rows: exec.sql_result.rows.slice(0, RESULT_ROW_LIMIT),
      rowCount: exec.sql_result.rowCount,
      truncated,
    };

    yield { type: 'sql', query: input.sql, status: 'success' };
    yield { type: 'result', data: sqlResult };

    const afterSql: BiAgentState = {
      ...baseState,
      sql_result: sqlResult,
      sql_error: null,
    };

    let chartConfig: Record<string, unknown> | null = null;
    let chartError: string | null = null;
    yield { type: 'status', step: 'generating_chart', message: '正在生成图表...' };
    try {
      const chartOut = await nodes.chartGeneratorNode(afterSql);
      chartConfig = chartOut.chart_config ?? null;
      if (chartConfig) {
        yield { type: 'chart', config: chartConfig };
      }
    } catch (err) {
      chartError = (err as Error).message ?? '图表生成失败';
      yield {
        type: 'error',
        code: '1004',
        message: `SQL 已保存，图表生成失败，可重试：${chartError}`,
      };
    }

    let analystText = '';
    let analystError: string | null = null;
    yield { type: 'status', step: 'analyzing', message: '正在生成业务洞察...' };
    try {
      const resultSummary = JSON.stringify({
        columns: sqlResult.columns,
        rowCount: sqlResult.rowCount,
        sampleRows: sqlResult.rows.slice(0, 50),
      });
      const response = await withLlmRetry(
        async () => {
          const model = this.llm.create({ streaming: false });
          return model.invoke([
            new SystemMessage(ANALYST_SYSTEM_PROMPT),
            new HumanMessage(
              `用户问题：${input.question}\n查询结果摘要：${resultSummary}`,
            ),
          ]);
        },
        { signal: input.signal },
      );
      analystText = chunkText(response);
      if (analystText) {
        yield { type: 'token', content: analystText };
      }
    } catch (err) {
      analystError = (err as Error).message ?? '洞察生成失败';
      yield {
        type: 'error',
        code: '1004',
        message: `SQL 已保存，业务洞察生成失败，可重试：${analystError}`,
      };
    }

    return {
      sqlResult,
      sqlError: null,
      truncated,
      chartConfig,
      chartError,
      analystText,
      analystError,
    };
  }
}
