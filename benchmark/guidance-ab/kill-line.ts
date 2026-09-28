import {
  GOLD_AMBIGUOUS_IDS,
  PRIMARY_REQUIRED_DELTA,
  SECONDARY_REQUIRED_DELTA,
  TARGET_AGG_FILTER_GRAIN_IDS,
} from './pinned';
import {
  ARMS,
  type ArmName,
  type Exclusion,
  type KillDecision,
  type KillLine,
} from './types';

const GOLD_AMBIGUOUS = new Set<string>(GOLD_AMBIGUOUS_IDS);
const TARGET_IDS = new Set<string>(TARGET_AGG_FILTER_GRAIN_IDS);

export function killLineRule(): string {
  const secondaryDenominator = TARGET_AGG_FILTER_GRAIN_IDS.length;
  return (
    `Primary: guidance − schema-dump on exec@1 ∧ value_match must be >= +${PRIMARY_REQUIRED_DELTA}/N, ` +
    'where N is the clean question count after excluding unrecovered LLM aborts or fetch failures and the gold-ambiguous ids. ' +
    `Secondary: on the target agg/filter/grain set, the same delta must be >= +${SECONDARY_REQUIRED_DELTA}/${secondaryDenominator}. ` +
    'Either miss kills the experiment. Do not ship this guidance onto the main planner path.'
  );
}

/** Abort / fetch-failed from the LLM client. SQL errors stay in the denominator. */
export function isUnrecoveredLlmNoiseError(error: string | null | undefined): boolean {
  if (!error) return false;
  return /aborted/i.test(error) || /fetch failed/i.test(error);
}

export function exclusionFor(id: string, errors: Array<string | null>): Exclusion | null {
  if (errors.some((error) => isUnrecoveredLlmNoiseError(error))) return 'unrecovered-llm-noise';
  if (GOLD_AMBIGUOUS.has(id)) return 'gold-ambiguous';
  return null;
}

export interface KillItem {
  id: string;
  arms: Record<ArmName, { pass: boolean; error: string | null }>;
}

export interface AnnotatedKillItem {
  id: string;
  exclusion: Exclusion | null;
  primaryIncluded: boolean;
  targetSet: boolean;
}

export function annotateItem(item: KillItem): AnnotatedKillItem {
  const exclusion = exclusionFor(
    item.id,
    ARMS.map((arm) => item.arms[arm].error),
  );
  return {
    id: item.id,
    exclusion,
    primaryIncluded: exclusion == null,
    targetSet: TARGET_IDS.has(item.id),
  };
}

function passCount(items: KillItem[], arm: ArmName): number {
  return items.filter((item) => item.arms[arm].pass).length;
}

function delta(items: KillItem[]): number {
  return passCount(items, 'guidance') - passCount(items, 'schema-dump');
}

/**
 * N is the clean count. A denominator equal to the raw item count is rejected
 * once any gold-ambiguous or unrecovered noise item is in the run.
 */
export function assertCleanDenominator(rawCount: number, cleanCount: number, excludedCount: number): void {
  if (excludedCount > 0 && cleanCount === rawCount) {
    throw new Error(
      `dirty denominator ${rawCount}: clean N must drop unrecovered LLM noise and gold-ambiguous ids`,
    );
  }
  if (cleanCount + excludedCount !== rawCount) {
    throw new Error(
      `dirty denominator: clean ${cleanCount} + excluded ${excludedCount} !== raw ${rawCount}`,
    );
  }
}

export function evaluateKillLine(params: {
  items: KillItem[];
  dryRun: boolean;
  fullDataset: boolean;
}): KillLine {
  const notes = params.items.map((item) => ({ item, note: annotateItem(item) }));
  const excludedAmbiguous = notes
    .filter((row) => GOLD_AMBIGUOUS.has(row.item.id))
    .map((row) => row.item.id);
  const excludedNoise = notes
    .filter((row) => row.note.exclusion === 'unrecovered-llm-noise')
    .map((row) => row.item.id);
  const clean = notes.filter((row) => row.note.primaryIncluded).map((row) => row.item);
  const excludedCount = params.items.length - clean.length;
  assertCleanDenominator(params.items.length, clean.length, excludedCount);

  const targetRows = notes.filter((row) => row.note.targetSet);
  const blockedTargetNoise = targetRows
    .filter((row) => row.note.exclusion === 'unrecovered-llm-noise')
    .map((row) => row.item.id);
  const cleanTarget = targetRows
    .filter((row) => row.note.primaryIncluded)
    .map((row) => row.item);

  const primaryDelta = delta(clean);
  const secondaryDelta = delta(cleanTarget);
  const targetComplete =
    targetRows.length === TARGET_AGG_FILTER_GRAIN_IDS.length && blockedTargetNoise.length === 0;
  const judgeable = !params.dryRun && params.fullDataset && blockedTargetNoise.length === 0;
  const primaryApplicable = judgeable;
  const secondaryApplicable = judgeable && targetComplete;
  const primaryMet = primaryApplicable && primaryDelta >= PRIMARY_REQUIRED_DELTA;
  const secondaryMet = secondaryApplicable && secondaryDelta >= SECONDARY_REQUIRED_DELTA;
  const applicable = primaryApplicable && secondaryApplicable;
  const met = primaryMet && secondaryMet;

  let decision: KillDecision;
  if (!applicable) decision = 'incomplete';
  else if (met) decision = 'clear';
  else decision = 'kill';

  return {
    rule: killLineRule(),
    decision,
    applicable,
    met,
    primary: {
      required_delta: PRIMARY_REQUIRED_DELTA,
      denominator: clean.length,
      observed_delta: primaryDelta,
      schema_dump_pass: passCount(clean, 'schema-dump'),
      guidance_pass: passCount(clean, 'guidance'),
      applicable: primaryApplicable,
      met: primaryMet,
      excluded_gold_ambiguous: excludedAmbiguous,
      excluded_unrecovered_llm_noise: excludedNoise,
    },
    secondary: {
      required_delta: SECONDARY_REQUIRED_DELTA,
      denominator: TARGET_AGG_FILTER_GRAIN_IDS.length,
      observed_delta: secondaryDelta,
      schema_dump_pass: passCount(cleanTarget, 'schema-dump'),
      guidance_pass: passCount(cleanTarget, 'guidance'),
      applicable: secondaryApplicable,
      met: secondaryMet,
      ids: [...TARGET_AGG_FILTER_GRAIN_IDS],
      blocked_unrecovered_llm_noise: blockedTargetNoise,
    },
  };
}
