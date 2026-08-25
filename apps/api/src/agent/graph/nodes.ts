import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { QueryIntent } from '@ai-bi/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SandboxService } from '../../sandbox/sandbox.service';
import type { LlmService } from '../llm.service';
import type { BiAgentState } from './state';
import {
  ANALYST_SYSTEM_PROMPT,
  CHART_SYSTEM_PROMPT,
  PLANNER_SYSTEM_PROMPT,
  SQL_SYSTEM_PROMPT,
} from './prompts';

function stripCodeFence(text: string): string {
  return text
    .replace(/^```[a-zA-Z]*\n?/m, '')
    .replace(/```\s*$/m, '')
    .trim();
}

export interface NodeDeps {
  prisma: PrismaService;
  sandbox: SandboxService;
  llm: LlmService;
}

export function createNodes(deps: NodeDeps) {
  const { prisma, sandbox, llm } = deps;

  async function plannerNode(state: BiAgentState) {
    const dataSource = await prisma.dataSource.findUnique({
      where: { id: state.data_source_id },
      select: { schemaDoc: true },
    });
    // schemaDoc 摘要：只取表名行，控制 token 消耗
    const schemaSummary = (dataSource?.schemaDoc ?? '')
      .split('\n')
      .filter((line) => /CREATE TABLE|^--/i.test(line))
      .join('\n')
      .slice(0, 4000);

    const model = llm.create({ jsonMode: true });
    const response = await model.invoke([
      new SystemMessage(PLANNER_SYSTEM_PROMPT),
      new HumanMessage(
        `问题：${state.question}\n可用表摘要：\n${schemaSummary || '（未同步表结构）'}`,
      ),
    ]);

    const intent = JSON.parse(stripCodeFence(String(response.content))) as QueryIntent;
    return {
      intent,
      relevant_tables: intent.relevant_tables ?? [],
    };
  }

  async function schemaFetcherNode(state: BiAgentState) {
    const dataSource = await prisma.dataSource.findUnique({
      where: { id: state.data_source_id },
      select: { schemaDoc: true },
    });
    const schemaDoc = dataSource?.schemaDoc ?? '';

    if (state.relevant_tables.length === 0 || !schemaDoc) {
      return { table_schema: schemaDoc.slice(0, 8000) };
    }

    // 按 CREATE TABLE 块切分，仅保留相关表的 DDL
    const blocks = schemaDoc.split(/(?=CREATE TABLE)/i);
    const relevant = blocks.filter((block) =>
      state.relevant_tables.some((t) =>
        block.toLowerCase().includes(t.toLowerCase()),
      ),
    );
    return {
      table_schema: (relevant.length > 0 ? relevant.join('\n') : schemaDoc).slice(0, 8000),
    };
  }

  async function sqlGeneratorNode(state: BiAgentState) {
    const dataSource = await prisma.dataSource.findUnique({
      where: { id: state.data_source_id },
      select: { type: true },
    });
    const dialect = dataSource?.type === 'MYSQL' ? 'MySQL' : 'PostgreSQL';

    const systemPrompt = SQL_SYSTEM_PROMPT.replace('{dialect}', dialect).replace(
      '{table_schema}',
      state.table_schema,
    );
    const userParts = [`查询意图：${JSON.stringify(state.intent)}`];
    if (state.sql_error) {
      userParts.push(`上一次生成的 SQL：${state.generated_sql}`);
      userParts.push(`上一次执行错误：${state.sql_error}`);
    }

    const model = llm.create();
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userParts.join('\n\n')),
    ]);

    return { generated_sql: stripCodeFence(String(response.content)) };
  }

  async function sqlExecutorNode(state: BiAgentState) {
    const dataSource = await prisma.dataSource.findUnique({
      where: { id: state.data_source_id },
    });
    if (!dataSource) {
      return {
        sql_result: null,
        sql_error: '数据源不存在',
        error_count: state.error_count + 1,
      };
    }

    const result = await sandbox.execute(state.generated_sql, dataSource);
    if (result.success && result.data) {
      return { sql_result: result.data, sql_error: null };
    }
    return {
      sql_result: null,
      sql_error: result.error ?? '未知错误',
      error_count: state.error_count + 1,
    };
  }

  async function chartGeneratorNode(state: BiAgentState) {
    const systemPrompt = CHART_SYSTEM_PROMPT.replace(
      '{chartType}',
      state.intent?.chartType ?? 'line',
    );
    const rows = state.sql_result?.rows.slice(0, 100) ?? [];

    const model = llm.create({ jsonMode: true });
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(
        [
          `查询意图：${JSON.stringify(state.intent)}`,
          `查询结果列：${JSON.stringify(state.sql_result?.columns ?? [])}`,
          `查询结果数据（前 100 行）：${JSON.stringify(rows)}`,
        ].join('\n'),
      ),
    ]);

    const chartConfig = JSON.parse(stripCodeFence(String(response.content)));
    return { chart_config: chartConfig };
  }

  /** 兜底节点：仅作为路由终点标记，具体兜底文案由 AgentService 发射 */
  async function fallbackNode(_state: BiAgentState) {
    return {};
  }

  /** Analyst Agent：图内调用 LLM，streamEvents 会转发 on_chat_model_stream */
  async function analystNode(state: BiAgentState) {
    const resultSummary = JSON.stringify({
      columns: state.sql_result?.columns,
      rowCount: state.sql_result?.rowCount,
      sampleRows: state.sql_result?.rows.slice(0, 50),
    });

    const model = llm.create({ streaming: true });
    await model.invoke([
      new SystemMessage(ANALYST_SYSTEM_PROMPT),
      new HumanMessage(
        `用户问题：${state.question}\n查询结果摘要：${resultSummary}`,
      ),
    ]);

    return {};
  }

  return {
    plannerNode,
    schemaFetcherNode,
    sqlGeneratorNode,
    sqlExecutorNode,
    chartGeneratorNode,
    analystNode,
    fallbackNode,
  };
}
