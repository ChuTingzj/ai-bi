'use client';

import type { QueryResult } from '@ai-bi/shared';

export function ResultTable({ data }: { data: QueryResult }) {
  if (data.rowCount === 0 || data.rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
        <p>查询成功但没有返回任何行。</p>
        <p className="mt-1">可尝试放宽 WHERE 过滤条件或确认时间范围。</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {data.truncated && (
        <p className="sticky top-0 z-10 border-b border-border bg-amber-50 px-3 py-1.5 text-xs text-accent">
          结果已截断，仅展示前 {data.rows.length} 行（共 {data.rowCount} 行）
        </p>
      )}
      <table className="min-w-full text-left text-xs">
        <thead className="sticky top-0 bg-muted">
          <tr>
            {data.columns.map((col) => (
              <th
                key={col}
                className="whitespace-nowrap border-b border-border px-3 py-2 font-medium text-foreground"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="odd:bg-card even:bg-muted/40">
              {data.columns.map((col) => (
                <td
                  key={col}
                  className="max-w-xs truncate whitespace-nowrap border-b border-border px-3 py-1.5 font-mono text-foreground"
                  title={stringifyCell(row[col])}
                >
                  {stringifyCell(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
