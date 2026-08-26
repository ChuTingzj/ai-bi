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
    .addEdge(START, 'planner')
    .addEdge('planner', 'schemaFetcher')
    .addEdge('schemaFetcher', 'sqlGenerator')
    .addEdge('sqlGenerator', 'sqlExecutor')
    .addConditionalEdges('sqlExecutor', routeAfterSqlExecution, {
      chartGenerator: 'chartGenerator',
      sqlGenerator: 'sqlGenerator',
      fallback: 'fallback',
    })
    .addEdge('chartGenerator', 'analyst')
    .addEdge('analyst', END)
    .addEdge('fallback', END);

  return graph.compile(checkpointer ? { checkpointer } : undefined);
}
