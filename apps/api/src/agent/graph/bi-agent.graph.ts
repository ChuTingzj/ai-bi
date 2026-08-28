import { StateGraph, START, END } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { BiAgentStateAnnotation, BiAgentState } from './state';
import { createNodes, NodeDeps } from './nodes';

const MAX_RETRIES = 3;

export function routeAfterSqlExecution(state: BiAgentState): string {
  if (state.sql_result && !state.sql_error) return 'chartGenerator';
  if (state.error_count < MAX_RETRIES) return 'sqlGenerator';
  return 'fallback';
}

/**
 * After planner: continue only when at least one recalled table exists in schema.
 * Otherwise enter guidance (first failure) or intent-fail exit (after guidance).
 */
export function routeAfterPlanner(state: BiAgentState): string {
  if (state.relevant_tables.length > 0) return 'schemaFetcher';
  if (state.after_guidance) return 'intentFailExit';
  return 'guidanceExit';
}

export function buildBiAgentGraph(
  deps: NodeDeps,
  checkpointer?: BaseCheckpointSaver,
) {
  if (!deps.prisma) {
    throw new Error('buildBiAgentGraph: deps.prisma is required');
  }
  const nodes = createNodes(deps);

  const graph = new StateGraph(BiAgentStateAnnotation)
    .addNode('planner', nodes.plannerNode)
    .addNode('schemaFetcher', nodes.schemaFetcherNode)
    .addNode('sqlGenerator', nodes.sqlGeneratorNode)
    .addNode('sqlExecutor', nodes.sqlExecutorNode)
    .addNode('chartGenerator', nodes.chartGeneratorNode)
    .addNode('analyst', nodes.analystNode)
    .addNode('fallback', nodes.fallbackNode)
    .addNode('guidanceExit', nodes.guidanceExitNode)
    .addNode('intentFailExit', nodes.intentFailExitNode)
    .addEdge(START, 'planner')
    .addConditionalEdges('planner', routeAfterPlanner, {
      schemaFetcher: 'schemaFetcher',
      guidanceExit: 'guidanceExit',
      intentFailExit: 'intentFailExit',
    })
    .addEdge('schemaFetcher', 'sqlGenerator')
    .addEdge('sqlGenerator', 'sqlExecutor')
    .addConditionalEdges('sqlExecutor', routeAfterSqlExecution, {
      chartGenerator: 'chartGenerator',
      sqlGenerator: 'sqlGenerator',
      fallback: 'fallback',
    })
    .addEdge('chartGenerator', 'analyst')
    .addEdge('analyst', END)
    .addEdge('fallback', END)
    .addEdge('guidanceExit', END)
    .addEdge('intentFailExit', END);

  return graph.compile(checkpointer ? { checkpointer } : undefined);
}
