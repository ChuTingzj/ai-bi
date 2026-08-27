import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  AggregateMetrics,
  BenchmarkSummary,
  CaseResult,
  Thresholds,
} from './types';
import { DEFAULT_THRESHOLDS } from './types';

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function aggregateMetrics(cases: CaseResult[]): AggregateMetrics {
  const failure_modes: Record<string, number> = {};

  for (const c of cases) {
    if (c.scores.fallback) {
      failure_modes['fallback'] = (failure_modes['fallback'] ?? 0) + 1;
    } else if (!c.scores.exec_success) {
      const reason = c.run.sql_error ?? 'sql_execution_failed';
      failure_modes[reason.slice(0, 80)] =
        (failure_modes[reason.slice(0, 80)] ?? 0) + 1;
    } else if (!c.scores.sql_value_match && !c.scores.sql_result_match) {
      failure_modes['sql_value_mismatch'] =
        (failure_modes['sql_value_mismatch'] ?? 0) + 1;
    } else if (!c.scores.chart_valid) {
      failure_modes['invalid_chart'] = (failure_modes['invalid_chart'] ?? 0) + 1;
    } else if (!c.scores.e2e_success) {
      failure_modes['partial_success'] =
        (failure_modes['partial_success'] ?? 0) + 1;
    }
  }

  const by_level: AggregateMetrics['by_level'] = {};
  for (const c of cases) {
    if (!by_level[c.level]) {
      by_level[c.level] = {
        total: 0,
        e2e_tsr: 0,
        exec_at_1: 0,
        sql_value_match: 0,
      };
    }
    by_level[c.level].total += 1;
    if (c.scores.e2e_success) by_level[c.level].e2e_tsr += 1;
    if (c.scores.exec_at_1) by_level[c.level].exec_at_1 += 1;
    if (c.scores.sql_value_match) by_level[c.level].sql_value_match += 1;
  }
  for (const level of Object.keys(by_level)) {
    const n = by_level[level].total;
    by_level[level].e2e_tsr /= n;
    by_level[level].exec_at_1 /= n;
    by_level[level].sql_value_match /= n;
  }

  const latencies = cases.map((c) => c.run.total_latency_ms);

  return {
    total: cases.length,
    e2e_tsr: avg(cases.map((c) => (c.scores.e2e_success ? 1 : 0))),
    exec_at_1: avg(cases.map((c) => (c.scores.exec_at_1 ? 1 : 0))),
    exec_success: avg(cases.map((c) => (c.scores.exec_success ? 1 : 0))),
    sql_at_1: avg(cases.map((c) => (c.scores.sql_at_1 ? 1 : 0))),
    sql_at_3: avg(cases.map((c) => (c.scores.sql_at_3 ? 1 : 0))),
    sql_value_match: avg(cases.map((c) => (c.scores.sql_value_match ? 1 : 0))),
    sql_row_count_match: avg(
      cases.map((c) => (c.scores.sql_row_count_match ? 1 : 0)),
    ),
    intent_table_recall: avg(cases.map((c) => c.scores.intent_table_recall)),
    chart_valid_rate: avg(cases.map((c) => (c.scores.chart_valid ? 1 : 0))),
    chart_type_match_rate: avg(
      cases.map((c) => (c.scores.chart_type_match ? 1 : 0)),
    ),
    analyst_keyword_coverage: avg(
      cases.map((c) => c.scores.analyst_keyword_coverage),
    ),
    fallback_rate: avg(cases.map((c) => (c.scores.fallback ? 1 : 0))),
    avg_sql_attempts: avg(cases.map((c) => c.run.sql_attempts)),
    p50_latency_ms: percentile(latencies, 50),
    p95_latency_ms: percentile(latencies, 95),
    by_level,
    failure_modes,
  };
}

function buildRecommendation(metrics: AggregateMetrics): string {
  const lines: string[] = [];

  if (metrics.e2e_tsr >= 0.8 && metrics.exec_success >= 0.9) {
    lines.push('端到端与 SQL 执行成功率达标，单模型可支撑 MVP 日常看数。');
  }

  if (metrics.exec_at_1 >= 0.85 && metrics.sql_at_1 < 0.65) {
    if (metrics.sql_value_match >= 0.65) {
      lines.push(
        `首次执行成功率高（${pct(metrics.exec_at_1)}）且数值近似匹配达标（${pct(metrics.sql_value_match)}），SQL@1 偏低主因是列名/列集合与金标准不一致，属评测噪声为主。`,
      );
    } else {
      lines.push(
        `首次执行成功率高（${pct(metrics.exec_at_1)}）但数值匹配仅 ${pct(metrics.sql_value_match)}，说明业务口径（过滤条件/JOIN/枚举）偏差是主因，应强化 SQL 提示词与 schema 约定。`,
      );
    }
  } else if (metrics.exec_at_1 < 0.85 && metrics.sql_at_3 >= 0.85) {
    lines.push(
      `自纠错有效（Exec@1 ${pct(metrics.exec_at_1)} → SQL@3 ${pct(metrics.sql_at_3)}），建议优化首次生成质量以降低延迟。`,
    );
  }

  if (metrics.avg_sql_attempts > 1.5) {
    lines.push(
      `平均 SQL 尝试次数 ${metrics.avg_sql_attempts.toFixed(2)}，重试偏多会拉高延迟。`,
    );
  }

  if (metrics.p95_latency_ms > 45_000) {
    lines.push(
      `P95 延迟 ${Math.round(metrics.p95_latency_ms / 1000)}s 超出 45s 门槛，需压缩节点耗时或减少重试。`,
    );
  }

  if (
    (metrics.by_level['L2']?.e2e_tsr ?? 1) <
    (metrics.by_level['L1']?.e2e_tsr ?? 0) - 0.15
  ) {
    lines.push('多表 JOIN 场景明显弱于 L1，可考虑 SQL 专项模型。');
  } else if (metrics.fallback_rate > 0.15) {
    lines.push('Fallback 率偏高，优先检查 schemaDoc 与提示词。');
  }

  if (lines.length === 0) {
    lines.push(
      '当前指标未达 MVP 门槛，建议做 SQL 专项模型 A/B 或加强金标准口径对齐。',
    );
  }

  return lines.join(' ');
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

type ThresholdKind = 'gte' | 'lte' | 'lte_abs';

const THRESHOLD_META: Record<
  keyof Thresholds,
  { label: string; kind: ThresholdKind; metricKey: keyof AggregateMetrics }
> = {
  e2e_tsr: { label: 'E2E-TSR', kind: 'gte', metricKey: 'e2e_tsr' },
  exec_at_1: { label: 'Exec@1', kind: 'gte', metricKey: 'exec_at_1' },
  exec_success: {
    label: 'Exec Success',
    kind: 'gte',
    metricKey: 'exec_success',
  },
  sql_value_match: {
    label: 'SQL Value Match',
    kind: 'gte',
    metricKey: 'sql_value_match',
  },
  sql_at_1: { label: 'SQL@1 (strict)', kind: 'gte', metricKey: 'sql_at_1' },
  sql_at_3: { label: 'SQL@3', kind: 'gte', metricKey: 'sql_at_3' },
  intent_table_recall: {
    label: 'Intent Table Recall',
    kind: 'gte',
    metricKey: 'intent_table_recall',
  },
  chart_valid_rate: {
    label: 'Chart Valid Rate',
    kind: 'gte',
    metricKey: 'chart_valid_rate',
  },
  chart_type_match_rate: {
    label: 'Chart Type Match',
    kind: 'gte',
    metricKey: 'chart_type_match_rate',
  },
  analyst_keyword_coverage: {
    label: 'Analyst Keyword Coverage',
    kind: 'gte',
    metricKey: 'analyst_keyword_coverage',
  },
  p95_latency_ms: {
    label: 'P95 Latency (ms)',
    kind: 'lte_abs',
    metricKey: 'p95_latency_ms',
  },
  avg_sql_attempts: {
    label: 'Avg SQL Attempts',
    kind: 'lte_abs',
    metricKey: 'avg_sql_attempts',
  },
  fallback_rate: { label: 'Fallback Rate', kind: 'lte', metricKey: 'fallback_rate' },
};

export function buildSummary(params: {
  model: string;
  dataset: string;
  cases: CaseResult[];
  thresholds?: Thresholds;
}): BenchmarkSummary {
  const thresholds = params.thresholds ?? DEFAULT_THRESHOLDS;
  const metrics = aggregateMetrics(params.cases);

  const threshold_results: BenchmarkSummary['threshold_results'] = {};
  for (const key of Object.keys(THRESHOLD_META) as (keyof Thresholds)[]) {
    const meta = THRESHOLD_META[key];
    const value = metrics[meta.metricKey] as number;
    const threshold = thresholds[key];
    const pass =
      meta.kind === 'gte'
        ? value >= threshold
        : meta.kind === 'lte'
          ? value <= threshold
          : value <= threshold;
    threshold_results[key] = { value, threshold, pass };
  }

  return {
    model: params.model,
    dataset: params.dataset,
    run_at: new Date().toISOString(),
    thresholds,
    metrics,
    threshold_results,
    recommendation: buildRecommendation(metrics),
    cases: params.cases,
  };
}

export function renderMarkdown(summary: BenchmarkSummary): string {
  const lines: string[] = [
    `# Benchmark Report — ${summary.model}`,
    '',
    `**Run at:** ${summary.run_at}`,
    `**Dataset:** ${summary.dataset}`,
    '',
    '## Summary',
    '',
    '| Metric | Result | Threshold | Status |',
    '|--------|--------|-----------|--------|',
  ];

  for (const key of Object.keys(THRESHOLD_META) as (keyof Thresholds)[]) {
    const meta = THRESHOLD_META[key];
    const result = summary.threshold_results[key];
    let val: string;
    let thr: string;
    if (meta.kind === 'lte_abs') {
      if (key === 'p95_latency_ms') {
        val = `${Math.round(result.value)}`;
        thr = `≤ ${result.threshold}`;
      } else {
        val = result.value.toFixed(2);
        thr = `≤ ${result.threshold}`;
      }
    } else if (meta.kind === 'lte') {
      val = pct(result.value);
      thr = `≤ ${pct(result.threshold)}`;
    } else {
      val = pct(result.value);
      thr = `≥ ${pct(result.threshold)}`;
    }
    lines.push(
      `| ${meta.label} | ${val} | ${thr} | ${result.pass ? 'PASS' : 'FAIL'} |`,
    );
  }

  lines.push(
    '',
    '## Supplementary',
    '',
    `| Metric | Result |`,
    `|--------|--------|`,
    `| SQL Row Count Match | ${pct(summary.metrics.sql_row_count_match)} |`,
    `| P50 Latency (ms) | ${Math.round(summary.metrics.p50_latency_ms)} |`,
  );

  lines.push(
    '',
    '## By Level',
    '',
    '| Level | Count | E2E-TSR | Exec@1 | Value Match |',
    '|-------|-------|---------|--------|-------------|',
  );
  for (const [level, data] of Object.entries(summary.metrics.by_level)) {
    lines.push(
      `| ${level} | ${data.total} | ${pct(data.e2e_tsr)} | ${pct(data.exec_at_1)} | ${pct(data.sql_value_match)} |`,
    );
  }

  lines.push('', '## Top Failure Modes', '');
  const modes = Object.entries(summary.metrics.failure_modes).sort(
    (a, b) => b[1] - a[1],
  );
  if (modes.length === 0) {
    lines.push('No failures recorded.');
  } else {
    for (const [mode, count] of modes.slice(0, 8)) {
      lines.push(`- ${mode}: ${count} cases`);
    }
  }

  const gateKeys: (keyof Thresholds)[] = [
    'e2e_tsr',
    'exec_success',
    'sql_value_match',
    'p95_latency_ms',
    'fallback_rate',
  ];
  const gatePass = gateKeys.every((k) => summary.threshold_results[k]?.pass);
  lines.push(
    '',
    '## Go / No-Go',
    '',
    gatePass
      ? '**GO** — 核心运营门槛（E2E / Exec / Value Match / Latency / Fallback）达标。'
      : '**NO-GO** — 核心门槛未全部达标（SQL@1 strict 单独 FAIL 不阻塞 GO，以 Value Match 为准）。',
    '',
    '## Recommendation',
    '',
    summary.recommendation,
    '',
    '## Case Details',
    '',
  );

  for (const c of summary.cases) {
    const status = c.scores.e2e_success ? 'PASS' : 'FAIL';
    lines.push(
      `### ${c.case_id} (${status})`,
      `- Level: ${c.level}`,
      `- Question: ${c.question}`,
      `- E2E: ${status} | Exec@1: ${c.scores.exec_at_1} | Value: ${c.scores.sql_value_match} | SQL@1: ${c.scores.sql_at_1} | Attempts: ${c.run.sql_attempts} | Latency: ${c.run.total_latency_ms}ms`,
    );
    if (c.failure_reason) {
      lines.push(`- Failure: ${c.failure_reason}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function writeReport(summary: BenchmarkSummary, outputDir: string): void {
  const runDir = join(outputDir, summary.run_at.replace(/[:.]/g, '-'));
  mkdirSync(join(runDir, 'cases'), { recursive: true });

  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(runDir, 'report.md'), renderMarkdown(summary));

  for (const c of summary.cases) {
    writeFileSync(
      join(runDir, 'cases', `${c.case_id}.json`),
      JSON.stringify(c, null, 2),
    );
  }

  console.log(`Report written to ${runDir}`);
}
