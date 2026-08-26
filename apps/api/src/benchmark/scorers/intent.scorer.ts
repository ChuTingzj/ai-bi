import type { QueryIntent } from '@ai-bi/shared';
import type { GoldCase } from '../types';

export function scoreIntent(
  intent: QueryIntent | null,
  relevant_tables: string[],
  goldCase: GoldCase,
): { table_recall: number; chart_type_match: boolean } {
  const expected = new Set(goldCase.expected_tables.map((t) => t.toLowerCase()));
  const actual = new Set(
    (relevant_tables.length > 0
      ? relevant_tables
      : intent?.relevant_tables ?? []
    ).map((t) => t.toLowerCase()),
  );

  let hits = 0;
  for (const t of expected) {
    if (actual.has(t)) hits += 1;
  }
  const table_recall = expected.size === 0 ? 1 : hits / expected.size;

  const chart_type_match =
    !goldCase.expected_chart_type ||
    intent?.chartType === goldCase.expected_chart_type;

  return { table_recall, chart_type_match };
}
