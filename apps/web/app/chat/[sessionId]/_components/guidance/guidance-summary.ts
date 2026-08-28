import type {
  GuidanceFilter,
  GuidancePayload,
  SchemaTableMeta,
} from '@ai-bi/shared';

export function buildGuidanceMessage(
  originalQuestion: string,
  payload: GuidancePayload,
): string {
  const filterText =
    payload.filters.length === 0
      ? '无'
      : payload.filters
          .map((f) => {
            if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
              return `${f.field} ${f.operator}`;
            }
            return `${f.field} ${f.operator} ${f.value ?? ''}`;
          })
          .join(' AND ');

  return [
    `基于表 ${payload.tables.join(', ')}`,
    `字段 ${payload.fields.join(', ') || '（未指定）'}`,
    `条件 ${filterText}`,
    `原问题：${originalQuestion}`,
  ].join('，');
}

export function columnsForTables(
  tables: SchemaTableMeta[],
  selectedTableNames: string[],
): { table: string; name: string; type?: string }[] {
  const selected = new Set(selectedTableNames.map((t) => t.toLowerCase()));
  const cols: { table: string; name: string; type?: string }[] = [];
  for (const table of tables) {
    if (!selected.has(table.name.toLowerCase())) continue;
    for (const col of table.columns) {
      cols.push({ table: table.name, name: col.name, type: col.type });
    }
  }
  return cols;
}

export const FILTER_OPERATORS: {
  value: GuidanceFilter['operator'];
  label: string;
}[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'LIKE', label: '包含' },
  { value: 'IN', label: '属于' },
  { value: 'IS NULL', label: '为空' },
  { value: 'IS NOT NULL', label: '非空' },
];

export function operatorNeedsValue(op: GuidanceFilter['operator']): boolean {
  return op !== 'IS NULL' && op !== 'IS NOT NULL';
}
