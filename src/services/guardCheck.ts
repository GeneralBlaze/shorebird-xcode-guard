import { resolveAction, type DriftAction, type DriftPolicy } from '../domain/driftPolicy';
import { compare, type DriftSeverity, type ToolchainFingerprint } from '../domain/fingerprint';
import type { Logger } from '../util/logger';
import type { Result } from '../util/result';
import type { Ledger, LedgerEntry, LedgerFailure } from './ledgerService';
import type { ShorebirdFailure, ShorebirdRelease, ShorebirdVersionInfo } from './shorebirdService';
import type { ActiveXcode, XcodeFailure } from './xcodeService';

export interface GuardInputs {
  readonly appId: string;
  readonly active: Result<ActiveXcode, XcodeFailure>;
  readonly version: Result<ShorebirdVersionInfo, ShorebirdFailure>;
  readonly releases: Result<readonly ShorebirdRelease[], ShorebirdFailure>;
  readonly ledger: Result<Ledger, LedgerFailure>;
  readonly policy: DriftPolicy;
  readonly checkFlutterRevision: boolean;
  readonly targetRelease: string | undefined;
}

export interface CheckedGuard {
  readonly state: 'checked';
  readonly targetRelease: string;
  readonly current: ToolchainFingerprint;
  readonly recorded: LedgerEntry | undefined;
  readonly severity: DriftSeverity;
  readonly flutterRevisionMatches: boolean;
  readonly action: DriftAction;
}

export type GuardOutcome =
  | CheckedGuard
  | { readonly state: 'no-xcode'; readonly reason: XcodeFailure }
  | {
      readonly state: 'cli-unavailable';
      readonly active: ActiveXcode;
      readonly reason: ShorebirdFailure;
    }
  | { readonly state: 'ledger-error'; readonly reason: LedgerFailure }
  | { readonly state: 'no-releases'; readonly active: ActiveXcode };

const numeric = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true });

function newestRelease(releases: readonly ShorebirdRelease[]): ShorebirdRelease | undefined {
  return [...releases]
    .sort((a, b) => numeric(a.createdAt, b.createdAt) || numeric(a.version, b.version))
    .at(-1);
}

function newestLedgerRelease(ledger: Ledger, appId: string): string | undefined {
  return Object.keys(ledger.apps[appId]?.releases ?? {})
    .sort(numeric)
    .at(-1);
}

function resolveTarget(inputs: GuardInputs, ledger: Ledger): string | undefined {
  if (inputs.targetRelease !== undefined) {
    return inputs.targetRelease;
  }
  const fromServer = inputs.releases.ok ? newestRelease(inputs.releases.value)?.version : undefined;
  return fromServer ?? newestLedgerRelease(ledger, inputs.appId);
}

function toFingerprint(active: ActiveXcode, version: ShorebirdVersionInfo): ToolchainFingerprint {
  return {
    xcodeVersion: active.xcodeVersion,
    xcodeBuild: active.xcodeBuild,
    xcodeDeveloperDir: active.xcodeDeveloperDir,
    flutterRevision: version.flutterRevision,
    shorebirdVersion: version.shorebirdVersion,
    macosVersion: active.macosVersion,
    capturedAt: new Date().toISOString(),
  };
}

function toRecordedFingerprint(entry: LedgerEntry): ToolchainFingerprint {
  return { ...entry, xcodeDeveloperDir: '' };
}

function serverFlutterMatches(
  inputs: GuardInputs,
  target: string,
  current: ToolchainFingerprint,
): boolean {
  if (!inputs.checkFlutterRevision || !inputs.releases.ok) {
    return true;
  }
  const release = inputs.releases.value.find((r) => r.version === target);
  return release === undefined || release.flutterRevision === current.flutterRevision;
}

export function runGuardCheck(inputs: GuardInputs, logger: Logger): GuardOutcome {
  const log = logger.child('guard');
  if (!inputs.active.ok) {
    return { state: 'no-xcode', reason: inputs.active.reason };
  }
  if (!inputs.version.ok) {
    return { state: 'cli-unavailable', active: inputs.active.value, reason: inputs.version.reason };
  }
  if (!inputs.ledger.ok) {
    return { state: 'ledger-error', reason: inputs.ledger.reason };
  }
  const target = resolveTarget(inputs, inputs.ledger.value);
  if (target === undefined) {
    return { state: 'no-releases', active: inputs.active.value };
  }
  const current = toFingerprint(inputs.active.value, inputs.version.value);
  const recorded = inputs.ledger.value.apps[inputs.appId]?.releases[target];
  const comparison = compare(
    current,
    recorded === undefined ? undefined : toRecordedFingerprint(recorded),
  );
  const flutterRevisionMatches =
    serverFlutterMatches(inputs, target, current) &&
    (!inputs.checkFlutterRevision || comparison.flutterRevisionMatches);
  const action = flutterRevisionMatches
    ? resolveAction(comparison.severity, inputs.policy)
    : 'block';
  log.info(
    `${inputs.appId}/${target}: Xcode ${current.xcodeVersion} (${current.xcodeBuild}) vs ${recorded?.xcodeVersion ?? '?'} (${recorded?.xcodeBuild ?? '?'}) → ${comparison.severity}, flutter ${flutterRevisionMatches ? 'ok' : 'drift'}, action ${action}`,
  );
  return {
    state: 'checked',
    targetRelease: target,
    current,
    recorded,
    severity: comparison.severity,
    flutterRevisionMatches,
    action,
  };
}
