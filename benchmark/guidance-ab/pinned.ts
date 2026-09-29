/**
 * Pinned from the schema-ab live run on 2026-09-24.
 * Report dir: benchmark/reports/schema-ab/2026-09-24T07-33-34-319Z
 * Model: deepseek/deepseek-v4-pro
 * Git: 999ed108199affddada88076160d82cf71c516a5
 * That run's schema-dump delta was +3 against a 20-item denominator (required +4). No schema-truth repo.
 */
export const TRIAGE_RUN = {
  reportDir: 'benchmark/reports/schema-ab/2026-09-24T07-33-34-319Z',
  llmModel: 'deepseek/deepseek-v4-pro',
  gitSha: '999ed108199affddada88076160d82cf71c516a5',
} as const;

/**
 * Transport failures observed on 2026-09-24. Not an automatic exclusion list.
 * An item leaves N only when both arms still show harness LLM transport errors.
 */
export const LLM_NOISE_IDS = [
  'BI-L2-002',
  'BI-L2-003',
  'BI-L2-004',
  'BI-L2-005',
  'BI-L2-006',
] as const;

/**
 * Out of the kill denominator. Not product failures.
 * BI-L2-007 moved here from the target set: gold SQL zero-fills with generate_series,
 * and frozen template rule 2 forbids inventing calendar zero-fill unless the question asks.
 */
export const GOLD_AMBIGUOUS_IDS = ['BI-L1-006', 'BI-L1-011', 'BI-L2-007'] as const;

/** Agg / filter / grain questions. Secondary kill line is +3/7 on this set. */
export const TARGET_AGG_FILTER_GRAIN_IDS = [
  'BI-L1-001',
  'BI-L1-002',
  'BI-L1-003',
  'BI-L1-004',
  'BI-L1-008',
  'BI-L1-009',
  'BI-L2-008',
] as const;

export const PRIMARY_REQUIRED_DELTA = 3;

export const SECONDARY_REQUIRED_DELTA = 3;

export const GUIDANCE_TEMPLATE_VERSION = 'guidance-intent-agg-grain-v1';

export const GUIDANCE_TEMPLATE_REPO_PATH =
  'benchmark/guidance-ab/templates/intent-aggregation-grain-v1.md';

export const LLM_NOISE_NOTES: Record<(typeof LLM_NOISE_IDS)[number], string> = {
  'BI-L2-002': 'abort',
  'BI-L2-003': 'fetch failed',
  'BI-L2-004': 'fetch failed',
  'BI-L2-005': 'fetch failed',
  'BI-L2-006': 'fetch failed',
};

export const GOLD_AMBIGUOUS_NOTES: Record<(typeof GOLD_AMBIGUOUS_IDS)[number], string> = {
  'BI-L1-006': 'zero-fill days?',
  'BI-L1-011': '14-day window inclusive',
  'BI-L2-007': 'gold generate_series zero-fill vs template rule 2',
};
