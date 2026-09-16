import type { DriftSeverity } from './fingerprint';

export type DriftThreshold = 'never' | 'major-drift' | 'minor-drift' | 'patch-drift';
export type DriftAction = 'allow' | 'warn' | 'block';

export interface DriftPolicy {
  readonly blockOn: DriftThreshold;
  readonly warnOn: DriftThreshold;
}

const RANK: Readonly<Record<Exclude<DriftSeverity, 'ok' | 'unknown'>, number>> = {
  'patch-drift': 1,
  'minor-drift': 2,
  'major-drift': 3,
};

const THRESHOLD_RANK: Readonly<Record<DriftThreshold, number>> = {
  never: Number.POSITIVE_INFINITY,
  'major-drift': 3,
  'minor-drift': 2,
  'patch-drift': 1,
};

export function resolveAction(severity: DriftSeverity, policy: DriftPolicy): DriftAction {
  if (severity === 'ok') {
    return 'allow';
  }
  if (severity === 'unknown') {
    return 'warn';
  }
  const rank = RANK[severity];
  if (rank >= THRESHOLD_RANK[policy.blockOn]) {
    return 'block';
  }
  if (rank >= THRESHOLD_RANK[policy.warnOn]) {
    return 'warn';
  }
  return 'allow';
}
