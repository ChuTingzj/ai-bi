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
    } else if (!c.scores.sql_at_3) {
      const reason = c.run.sql_error ?? 'sql_execution_failed';
      failure_modes[reason.slice(0, 80)] = (failure_modes[reason.slice(0, 80)] ?? 0) + 1;
    } else if (!c.scores.chart_valid) {
      failure_modes['invalid_chart'] = (failure_modes['invalid_chart'] ?? 0) + 1;
    } else if (!c.scores.e2e_success) {
      failure_modes['partial_success'] = (failure_modes['partial_success'] ?? 0) + 1;
    }
  }

  const by_level: Record<string, { total: number; e2e_tsr: number }> = {};
  for (const c of cases) {
    if (!by_level[c.level]) by_level[c.level] = { total: 0, e2e_tsr: 0 };
    by_level[c.level].total += 1;
    if (c.scores.e2e_success) by_level[c.level].e2e_tsr += 1;
  }
  for (const level of Object.keys(by_level)) {
    by_level[level].e2e_tsr /= by_level[level].total;
  }

  const latencies = cases.map((c) => c.run.total_latency_ms);

  return {
    total: cases.length,
    e2e_tsr: avg(cases.map((c) => (c.scores.e2e_success ? 1 : 0))),
    sql_at_1: avg(cases.map((c) => (c.scores.sql_at_1 ? 1 : 0))),
    sql_at_3: avg(cases.map((c) => (c.scores.sql_at_3 ? 1 : 0))),
    intent_table_recall: avg(cases.map((c) => c.scores.intent_table_recall)),
    chart_valid_rate: avg(cases.map((c) => (c.scores.chart_valid ? 1 : 0))),
    analyst_keyword_coverage: avg(cases.map((c) => c.scores.analyst_keyword_coverage)),
    fallback_rate: avg(cases.map((c) => (c.scores.fallback ? 1 : 0))),
    p50_latency_ms: percentile(latencies, 50),
    p95_latency_ms: percentile(latencies, 95),
    by_level,
    failure_modes,
  };
}

function buildRecommendation(metrics: AggregateMetrics): string {
  const lines: string[] = [];

  if (metrics.e2e_tsr >= 0.8 && metrics.sql_at_3 >= 0.85) {
    lines.push('端到端成功率与 SQL@3 达标，单模型架构可支撑 MVP 业务场景。');
  }

  if (metrics.sql_at_1 < 0.65 && metrics.sql_at_3 >= 0.85) {
    lines.push(
      '自纠错有效（SQL@3 达标但 SQL@1 仅 ' +
        `${(metrics.sql_at_1 * 100).toFixed(0)}%），建议优化 planner 选表与 schema 检索，减少重试开销。`,
    );
  }

  if (metrics.p95_latency_ms > 45_000) {
    lines.push(
      `P95 延迟 ${Math.round(metrics.p95_latency_ms / 1000)}s 超出 45s 门槛，主要因 SQL 多次重试；可通过提升 SQL@1 或使用更快模型改善。`,
    );
  }

  if ((metrics.by_level['L2']?.e2e_tsr ?? 1) < (metrics.by_level['L1']?.e2e_tsr ?? 0) - 0.15) {
    lines.push('多表 JOIN 场景是主要瓶颈，建议为 sqlGenerator 节点引入 SQL 专项模型。');
  } else if (metrics.fallback_rate > 0.15) {
    lines.push('Fallback 率偏高，优先检查 schemaDoc 同步与提示词，再考虑多模型拆分。');
  }

  if (lines.length === 0) {
    lines.push('当前单模型架构未达 MVP 门槛，建议运行 A/B 对照实验（SQL 专项模型 vs 推理模型）。');
  }

  return lines.join(' ');
}

export function buildSummary(params: {
  model: string;
  dataset: string;
  cases: CaseResult[];
  thresholds?: Thresholds;
}): BenchmarkSummary {
  const thresholds = params.thresholds ?? DEFAULT_THRESHOLDS;
  const metrics = aggregateMetrics(params.cases);

  const threshold_results: BenchmarkSummary['threshold_results'] = {
    e2e_tsr: {
      value: metrics.e2e_tsr,
      threshold: thresholds.e2e_tsr,
      pass: metrics.e2e_tsr >= thresholds.e2e_tsr,
    },
    sql_at_1: {
      value: metrics.sql_at_1,
      threshold: thresholds.sql_at_1,
      pass: metrics.sql_at_1 >= thresholds.sql_at_1,
    },
    sql_at_3: {
      value: metrics.sql_at_3,
      threshold: thresholds.sql_at_3,
      pass: metrics.sql_at_3 >= thresholds.sql_at_3,
    },
    intent_table_recall: {
      value: metrics.intent_table_recall,
      threshold: thresholds.intent_table_recall,
      pass: metrics.intent_table_recall >= thresholds.intent_table_recall,
    },
    chart_valid_rate: {
      value: metrics.chart_valid_rate,
      threshold: thresholds.chart_valid_rate,
      pass: metrics.chart_valid_rate >= thresholds.chart_valid_rate,
    },
    analyst_keyword_coverage: {
      value: metrics.analyst_keyword_coverage,
      threshold: thresholds.analyst_keyword_coverage,
      pass: metrics.analyst_keyword_coverage >= thresholds.analyst_keyword_coverage,
    },
    p95_latency_ms: {
      value: metrics.p95_latency_ms,
      threshold: thresholds.p95_latency_ms,
      pass: metrics.p95_latency_ms <= thresholds.p95_latency_ms,
    },
    fallback_rate: {
      value: metrics.fallback_rate,
      threshold: thresholds.fallback_rate,
      pass: metrics.fallback_rate <= thresholds.fallback_rate,
    },
  };

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

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
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

  const labels: Record<string, string> = {
    e2e_tsr: 'E2E-TSR',
    sql_at_1: 'SQL@1',
    sql_at_3: 'SQL@3',
    intent_table_recall: 'Intent Table Recall',
    chart_valid_rate: 'Chart Valid Rate',
    analyst_keyword_coverage: 'Analyst Keyword Coverage',
    p95_latency_ms: 'P95 Latency (ms)',
    fallback_rate: 'Fallback Rate',
  };

  for (const [key, result] of Object.entries(summary.threshold_results)) {
    const isLatency = key === 'p95_latency_ms';
    const isFallback = key === 'fallback_rate';
    const val = isLatency ? `${Math.round(result.value)}` : pct(result.value);
    const thr = isLatency
      ? `≤ ${result.threshold}`
      : isFallback
        ? `≤ ${pct(result.threshold)}`
        : `≥ ${pct(result.threshold)}`;
    lines.push(
      `| ${labels[key]} | ${val} | ${thr} | ${result.pass ? 'PASS' : 'FAIL'} |`,
    );
  }

  lines.push('', '## By Level', '', '| Level | Count | E2E-TSR |', '|-------|-------|---------|');
  for (const [level, data] of Object.entries(summary.metrics.by_level)) {
    lines.push(`| ${level} | ${data.total} | ${pct(data.e2e_tsr)} |`);
  }

  lines.push('', '## Top Failure Modes', '');
  const modes = Object.entries(summary.metrics.failure_modes).sort(
    (a, b) => b[1] - a[1],
  );
  if (modes.length === 0) {
    lines.push('No failures recorded.');
  } else {
    for (const [mode, count] of modes.slice(0, 5)) {
      lines.push(`- ${mode}: ${count} cases`);
    }
  }

  const allPass = Object.values(summary.threshold_results).every((r) => r.pass);
  lines.push(
    '',
    '## Go / No-Go',
    '',
    allPass
      ? '**GO** — 单模型架构达到 MVP 运营门槛。'
      : '**NO-GO** — 部分指标未达标，详见上表。',
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
      `- E2E: ${status} | SQL@1: ${c.scores.sql_at_1} | SQL@3: ${c.scores.sql_at_3} | Latency: ${c.run.total_latency_ms}ms`,
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
