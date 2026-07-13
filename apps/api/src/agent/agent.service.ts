import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { SseEvent } from '@ai-bi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { LlmService } from './llm.service';
import { buildBiAgentGraph } from './graph/bi-agent.graph';
import { FALLBACK_MESSAGE } from './graph/prompts';
import type { BiAgentState } from './graph/state';

export interface WorkflowInput {
  sessionId: string;
  question: string;
  dataSourceId: string;
  userId: string;
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
    private readonly prisma: PrismaService,
    private readonly sandbox: SandboxService,
    private readonly llm: LlmService,
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
        configurable: { thread_id: input.sessionId },
      },
    );

    let retryCount = 0;
    let lastSql = '';

    for await (const event of stream) {
      const nodeName = (event.metadata?.langgraph_node ?? event.name) as string;

      // 节点开始：推送进度状态
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
            retryCount = output.error_count ?? retryCount + 1;
            yield { type: 'sql', query: lastSql, status: 'error' };
          } else if (output.sql_result) {
            yield { type: 'sql', query: lastSql, status: 'success' };
          }
        }

        if (event.name === 'chartGenerator' && output.chart_config) {
          yield { type: 'chart', config: output.chart_config };
        }

        if (event.name === 'fallback') {
          yield { type: 'error', code: '1003', message: FALLBACK_MESSAGE };
        }
      }

      // Analyst 节点内 LLM 流式 token
      if (
        event.event === 'on_chat_model_stream' &&
        nodeName === 'analyst'
      ) {
        const chunk = event.data?.chunk;
        const content =
          typeof chunk?.content === 'string' ? chunk.content : '';
        if (content) {
          yield { type: 'token', content };
        }
      }
    }
  }
}
