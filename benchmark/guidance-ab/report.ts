import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { annotateItem, evaluateKillLine } from './kill-line';
import {
  GOLD_AMBIGUOUS_IDS,
  GOLD_AMBIGUOUS_NOTES,
  LLM_NOISE_IDS,
  LLM_NOISE_NOTES,
  TARGET_AGG_FILTER_GRAIN_IDS,
  TRIAGE_RUN,
} from './pinned';
import {
  ARMS,
  type ArmName,
  type ArmTotals,
  type GuidanceAbItem,
  type GuidanceAbReport,
  type LoadedGuidance,
} from './types';

export function emptyArmTotals(): ArmTotals {
  return { pass: 0, total: 0, write_reject_count: 0, timeout_count: 0 };
}

export function summarizeArms(items: GuidanceAbItem[]): Record<ArmName, ArmTotals> {
  const arms = {
    'schema-dump': emptyArmTotals(),
    guidance: emptyArmTotals(),
  };
  for (const item of items) {
    for (const arm of ARMS) {
      const result = item.arms[arm];
      const totals = arms[arm];
      totals.total += 1;
      if (result.pass) totals.pass += 1;
      if (result.write_reject) totals.write_reject_count += 1;
      if (result.timeout) totals.timeout_count += 1;
    }
  }
  return arms;
}

function withAnnotations(items: GuidanceAbItem[]): GuidanceAbItem[] {
  return items.map((item) => {
    const note = annotateItem(item);
    return {
      ...item,
      exclusion: note.exclusion,
      primary_included: note.primaryIncluded,
      target_set: note.targetSet,
    };
  });
}

export function buildReport(params: {
  dryRun: boolean;
  fullDataset: boolean;
  llmModel: string;
  dataset: string;
  gitSha: string;
  ffpSqlSandbox: string;
  startedAt: string;
  finishedAt: string;
  schemaDump: string;
  guidance: LoadedGuidance;
  prompts: GuidanceAbReport['prompts'];
  items: GuidanceAbItem[];
}): GuidanceAbReport {
  const items = withAnnotations(params.items);
  const killLine = evaluateKillLine({
    items,
    dryRun: params.dryRun,
    fullDataset: params.fullDataset,
  });
  return {
    experiment: 'guidance-ab',
    dry_run: params.dryRun,
    full_dataset: params.fullDataset,
    llm_model: params.llmModel,
    dataset: params.dataset,
    git_sha: params.gitSha,
    ffp_sql_sandbox: params.ffpSqlSandbox,
    metric: 'exec_at_1 AND sql_value_match',
    scorer: 'apps/api/src/benchmark/scorers/sql.scorer.ts#scoreSql',
    started_at: params.startedAt,
    finished_at: params.finishedAt,
    schema_dump: params.schemaDump,
    guidance: {
      version: params.guidance.version,
      path: params.guidance.path,
      sha256: params.guidance.sha256,
    },
    pinned: {
      triage_run: TRIAGE_RUN.reportDir,
      llm_model: TRIAGE_RUN.llmModel,
      git_sha: TRIAGE_RUN.gitSha,
      llm_noise: [...LLM_NOISE_IDS],
      gold_ambiguous: [...GOLD_AMBIGUOUS_IDS],
      target_agg_filter_grain: [...TARGET_AGG_FILTER_GRAIN_IDS],
    },
    prompts: params.prompts,
    kill_line: killLine,
    arms: summarizeArms(items),
    delta: killLine.primary.observed_delta,
    items,
  };
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function armCell(pass: boolean): string {
  return pass ? 'pass' : 'fail';
}

export function renderReportMarkdown(report: GuidanceAbReport): string {
  const primary = report.kill_line.primary;
  const secondary = report.kill_line.secondary;
  const lines = [
    '# Guidance A/B',
    '',
    'Arm A is schema-dump only. Arm B is schema-dump plus the frozen intent / aggregation / grain template.',
    'This harness does not call LangGraph / Lab and does not turn guidance on for product traffic.',
    '',
    `- LLM_MODEL: \`${report.llm_model}\``,
    `- Dataset: \`${report.dataset}\``,
    `- Git SHA: \`${report.git_sha}\``,
    `- ffp-sql-sandbox: \`${report.ffp_sql_sandbox}\``,
    `- Dry run: ${report.dry_run}`,
    `- Full dataset: ${report.full_dataset}`,
    `- Started: ${report.started_at}`,
    `- Finished: ${report.finished_at}`,
    `- Metric: ${report.metric}`,
    `- Scorer: \`${report.scorer}\``,
    '',
    '## Frozen guidance',
    '',
    `- Version: \`${report.guidance.version}\``,
    `- Path: \`${report.guidance.path}\``,
    `- SHA256: \`${report.guidance.sha256}\``,
    '',
    '## Pinned ids',
    '',
    `Triage run \`${report.pinned.triage_run}\` (\`${report.pinned.llm_model}\`, \`${report.pinned.git_sha}\`).`,
    '',
    `- LLM noise (exclude while unrecovered; not kill-line failures): ${report.pinned.llm_noise
      .map((id) => `${id} (${LLM_NOISE_NOTES[id as keyof typeof LLM_NOISE_NOTES]})`)
      .join(', ')}`,
    `- Gold-ambiguous (out of N; not product fails): ${report.pinned.gold_ambiguous
      .map((id) => `${id} (${GOLD_AMBIGUOUS_NOTES[id as keyof typeof GOLD_AMBIGUOUS_NOTES]})`)
      .join(', ')}`,
    `- Target agg/filter/grain: ${report.pinned.target_agg_filter_grain.join(', ')}`,
    '',
    '## Kill line',
    '',
    report.kill_line.rule,
    '',
    `Decision: **${report.kill_line.decision}**. Applicable: ${report.kill_line.applicable}. Met: ${report.kill_line.met}.`,
    '',
    `Primary N = ${primary.denominator}. Observed ${signed(primary.observed_delta)}/${primary.denominator} (guidance ${primary.guidance_pass}, schema-dump ${primary.schema_dump_pass}). Required +${primary.required_delta}/N. Met: ${primary.met}.`,
    `Excluded gold-ambiguous: ${primary.excluded_gold_ambiguous.join(', ') || 'none'}.`,
    `Excluded unrecovered LLM noise: ${primary.excluded_unrecovered_llm_noise.join(', ') || 'none'}.`,
    '',
    `Secondary target ${secondary.denominator}. Observed ${signed(secondary.observed_delta)}/${secondary.denominator} (guidance ${secondary.guidance_pass}, schema-dump ${secondary.schema_dump_pass}). Required +${secondary.required_delta}/${secondary.denominator}. Met: ${secondary.met}.`,
    `Target ids still blocked by unrecovered LLM noise: ${secondary.blocked_unrecovered_llm_noise.join(', ') || 'none'}.`,
    '',
    'A kill decision means do not ship this guidance onto the main planner path.',
    'Unrecovered aborts and fetch failures stay out of N. Re-run those items until the transport error is gone before treating them as product results.',
    '',
    '## Arm totals',
    '',
    'Totals below count every item in the run, including ids excluded from N.',
    '',
    '| Arm | Pass | Total | Write rejects | Timeouts |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const arm of ARMS) {
    const totals = report.arms[arm];
    lines.push(
      `| ${arm} | ${totals.pass} | ${totals.total} | ${totals.write_reject_count} | ${totals.timeout_count} |`,
    );
  }
  lines.push(
    '',
    '## Items',
    '',
    '| Id | Level | schema-dump | guidance | In N | Target | Exclusion |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const item of report.items) {
    lines.push(
      `| ${item.id} | ${item.level} | ${armCell(item.arms['schema-dump'].pass)} | ${armCell(item.arms.guidance.pass)} | ${item.primary_included ? 'yes' : 'no'} | ${item.target_set ? 'yes' : 'no'} | ${item.exclusion ?? ''} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function writeReport(report: GuidanceAbReport, outputDir: string): string {
  const dir = resolve(outputDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(dir, 'report.md'), renderReportMarkdown(report));
  return dir;
}
