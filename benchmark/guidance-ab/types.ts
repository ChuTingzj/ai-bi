import type { ExecuteOutcome } from '../schema-ab/types';

export const ARMS = ['schema-dump', 'guidance'] as const;

export type ArmName = (typeof ARMS)[number];

export type Exclusion = 'gold-ambiguous' | 'unrecovered-llm-noise';

export type KillDecision = 'clear' | 'kill' | 'incomplete';

export interface ArmItemResult {
  pass: boolean;
  exec_at_1: boolean;
  sql_value_match: boolean;
  outcome: ExecuteOutcome['kind'];
  write_reject: boolean;
  timeout: boolean;
  generated_sql: string;
  error: string | null;
}

export interface GuidanceAbItem {
  id: string;
  level: string;
  question: string;
  exclusion: Exclusion | null;
  primary_included: boolean;
  target_set: boolean;
  arms: Record<ArmName, ArmItemResult>;
}

export interface ArmTotals {
  pass: number;
  total: number;
  write_reject_count: number;
  timeout_count: number;
}

export interface KillAxis {
  required_delta: number;
  denominator: number;
  observed_delta: number;
  schema_dump_pass: number;
  guidance_pass: number;
  applicable: boolean;
  met: boolean;
}

export interface KillLine {
  rule: string;
  decision: KillDecision;
  applicable: boolean;
  met: boolean;
  primary: KillAxis & {
    excluded_gold_ambiguous: string[];
    excluded_unrecovered_llm_noise: string[];
  };
  secondary: KillAxis & {
    ids: string[];
    blocked_unrecovered_llm_noise: string[];
  };
}

export interface LoadedGuidance {
  version: string;
  path: string;
  sha256: string;
  body: string;
}

export interface GuidanceAbReport {
  experiment: 'guidance-ab';
  dry_run: boolean;
  full_dataset: boolean;
  llm_model: string;
  dataset: string;
  git_sha: string;
  ffp_sql_sandbox: string;
  metric: 'exec_at_1 AND sql_value_match';
  scorer: 'apps/api/src/benchmark/scorers/sql.scorer.ts#scoreSql';
  started_at: string;
  finished_at: string;
  schema_dump: string;
  guidance: {
    version: string;
    path: string;
    sha256: string;
  };
  pinned: {
    triage_run: string;
    llm_model: string;
    git_sha: string;
    llm_noise: string[];
    gold_ambiguous: string[];
    target_agg_filter_grain: string[];
  };
  prompts: Record<ArmName, string>;
  kill_line: KillLine;
  arms: Record<ArmName, ArmTotals>;
  delta: number;
  items: GuidanceAbItem[];
}
