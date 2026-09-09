import type { GuidancePayload } from '@ai-bi/shared';

function formatJoinEquals(join: GuidancePayload['joins'][number]): string {
  const parts = join.leftColumns.map((col, i) => {
    const right = join.rightColumns[i] ?? '';
    return `${join.leftTable}.${col} = ${join.rightTable}.${right}`;
  });
  return `${parts.join(' AND ')} (${join.type})`;
}

/** Format user guidance constraints for planner / SQL prompts. */
export function formatGuidanceBlock(guidance: GuidancePayload): string {
  const filterLines = guidance.filters.map((f) => {
    if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
      return `${f.field} ${f.operator}`;
    }
    return `${f.field} ${f.operator} ${f.value ?? ''}`;
  });
  const joins = guidance.joins ?? [];
  const lines = [
    '用户引导约束（必须遵守）：',
    `表：${guidance.tables.join(', ') || '（未选）'}`,
    `字段：${guidance.fields.join(', ') || '（未选）'}`,
    `过滤：${filterLines.join(' AND ') || '（无）'}`,
  ];
  if (joins.length > 0) {
    lines.push(`JOIN：${joins.map(formatJoinEquals).join('; ')}`);
    lines.push(
      '必须使用上述 INNER JOIN 连接表，不得改写关联键；SELECT/WHERE 优先使用引导中的限定字段。',
    );
  }
  return lines.join('\n');
}
