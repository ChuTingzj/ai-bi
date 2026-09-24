import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  ARMS,
  KILL_LINE_DELTA,
  KILL_LINE_DENOMINATOR,
  type ArmName,
  type ArmTotals,
  type SchemaAbItem,
  type SchemaAbReport,
} from './types';

export const KILL_LINE_RULE =
  'schema-dump must beat no-schema by >= +4/20 on exec@1 ∧ sql_value_match to justify a future schema-truth repo';

export function emptyArmTotals(): ArmTotals {
  return { pass: 0, total: 0, write_reject_count: 0, timeout_count: 0 };
}

export function summarizeArms(items: SchemaAbItem[]): Record<ArmName, ArmTotals> {
  const arms = {
    'no-schema': emptyArmTotals(),
    'schema-dump': emptyArmTotals(),
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

export function buildReport(params: {
  dryRun: boolean;
  llmModel: string;
  dataset: string;
  gitSha: string;
  ffpSqlSandbox: string;
  startedAt: string;
  finishedAt: string;
  schemaDump: string;
  prompts: SchemaAbReport['prompts'];
  items: SchemaAbItem[];
}): SchemaAbReport {
  const arms = summarizeArms(params.items);
  const delta = arms['schema-dump'].pass - arms['no-schema'].pass;
  const applicable =
    !params.dryRun && params.items.length === KILL_LINE_DENOMINATOR;
  return {
    experiment: 'schema-grounding-ab',
    dry_run: params.dryRun,
    llm_model: params.llmModel,
    dataset: params.dataset,
    git_sha: params.gitSha,
    ffp_sql_sandbox: params.ffpSqlSandbox,
    metric: 'exec_at_1 AND sql_value_match',
    scorer: 'apps/api/src/benchmark/scorers/sql.scorer.ts#scoreSql',
    started_at: params.startedAt,
    finished_at: params.finishedAt,
    schema_dump: params.schemaDump,
    prompts: params.prompts,
    kill_line: {
      rule: KILL_LINE_RULE,
      required_delta: KILL_LINE_DELTA,
      denominator: KILL_LINE_DENOMINATOR,
      observed_delta: delta,
      applicable,
      met: applicable && delta >= KILL_LINE_DELTA,
    },
    arms,
    delta,
    items: params.items,
  };
}

function armCell(pass: boolean): string {
  return pass ? 'pass' : 'fail';
}

export function renderReportMarkdown(report: SchemaAbReport): string {
  const lines = [
    '# Schema grounding A/B',
    '',
    `- LLM_MODEL: \`${report.llm_model}\``,
    `- Dataset: \`${report.dataset}\``,
    `- Git SHA: \`${report.git_sha}\``,
    `- ffp-sql-sandbox: \`${report.ffp_sql_sandbox}\``,
    `- Dry run: ${report.dry_run}`,
    `- Started: ${report.started_at}`,
    `- Finished: ${report.finished_at}`,
    `- Metric: ${report.metric}`,
    `- Scorer: \`${report.scorer}\``,
    '',
    '## Kill line',
    '',
    report.kill_line.rule,
    '',
    `Observed delta (schema-dump − no-schema): **${report.delta >= 0 ? '+' : ''}${report.delta}** / ${report.items.length}.`,
    `Required: +${report.kill_line.required_delta}/${report.kill_line.denominator}.`,
    `Applicable on this run: ${report.kill_line.applicable}. Met: ${report.kill_line.met}.`,
    '',
    'The kill line is a decision note for a future schema-truth repo. This harness does not open that repo.',
    '',
    '## Arm totals',
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
  lines.push('', '## Items', '', '| Id | Level | no-schema | schema-dump |', '| --- | --- | --- | --- |');
  for (const item of report.items) {
    lines.push(
      `| ${item.id} | ${item.level} | ${armCell(item.arms['no-schema'].pass)} | ${armCell(item.arms['schema-dump'].pass)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function writeReport(report: SchemaAbReport, outputDir: string): string {
  const dir = resolve(outputDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(dir, 'report.md'), renderReportMarkdown(report));
  return dir;
}
