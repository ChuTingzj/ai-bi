import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import type { SchemaAbCase } from './types';

interface GoldFileCase {
  id: string;
  level: string;
  question: string;
  gold_sql: string;
  result_tolerance?: { numeric_tolerance?: number };
}

interface GoldFile {
  cases: GoldFileCase[];
}

export function parseGoldCases(content: string): SchemaAbCase[] {
  const dataset = parseYaml(content) as GoldFile;
  if (!dataset?.cases?.length) {
    throw new Error('Dataset has no cases');
  }
  return dataset.cases.map((item) => ({
    id: item.id,
    level: item.level,
    question: item.question,
    gold_sql: item.gold_sql.trim(),
    numeric_tolerance: item.result_tolerance?.numeric_tolerance,
  }));
}

export function loadGoldCases(datasetPath: string): SchemaAbCase[] {
  return parseGoldCases(readFileSync(datasetPath, 'utf8'));
}

export function selectCases(
  cases: SchemaAbCase[],
  options: { caseIds?: string[]; limit?: number },
): SchemaAbCase[] {
  let selected = cases;
  if (options.caseIds?.length) {
    const byId = new Map(cases.map((item) => [item.id, item]));
    const unknown = options.caseIds.filter((id) => !byId.has(id));
    if (unknown.length) {
      throw new Error(
        `Unknown case id(s): ${unknown.join(', ')}. Available: ${cases.map((item) => item.id).join(', ')}`,
      );
    }
    selected = options.caseIds.map((id) => byId.get(id)!);
  }
  if (options.limit && options.limit > 0) {
    selected = selected.slice(0, options.limit);
  }
  if (selected.length === 0) {
    throw new Error('No cases matched the given filters.');
  }
  return selected;
}
