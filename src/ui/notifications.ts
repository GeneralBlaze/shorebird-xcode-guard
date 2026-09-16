import * as vscode from 'vscode';
import type { CheckedGuard } from '../services/guardCheck';

export type BlockChoice = 'switch' | 'build-anyway' | 'details' | 'cancel';

const SWITCH = (version: string): string => `Switch to Xcode ${version}`;
const BUILD_ANYWAY = 'Build anyway';
const DETAILS = 'Details';
const RECORD = 'Record current toolchain';

export function describeDrift(outcome: CheckedGuard): string {
  const recorded = outcome.recorded;
  const xcode =
    recorded === undefined
      ? `No toolchain recorded for release ${outcome.targetRelease}.`
      : `Release ${outcome.targetRelease} was built with Xcode ${recorded.xcodeVersion} (${recorded.xcodeBuild}); the active Xcode is ${outcome.current.xcodeVersion} (${outcome.current.xcodeBuild}).`;
  const flutter = outcome.flutterRevisionMatches
    ? ''
    : ` The Flutter revision also differs (${outcome.current.flutterRevision.slice(0, 10)} vs the release).`;
  return `${xcode}${flutter}`;
}

export async function showBlockingModal(
  outcome: CheckedGuard,
  whatWasStopped: string,
): Promise<BlockChoice> {
  const recordedVersion = outcome.recorded?.xcodeVersion;
  const allowSoftOverride = outcome.severity !== 'major-drift';
  const buttons = [
    ...(recordedVersion === undefined ? [] : [SWITCH(recordedVersion)]),
    ...(allowSoftOverride ? [BUILD_ANYWAY] : []),
    DETAILS,
  ];
  const choice = await vscode.window.showErrorMessage(
    `Shorebird Guard stopped ${whatWasStopped}: ${describeDrift(outcome)}`,
    {
      modal: true,
      detail: `Severity: ${outcome.severity}. A patch built with a different toolchain than its release can fail to link or misbehave on device.`,
    },
    ...buttons,
  );
  if (choice === undefined) {
    return 'cancel';
  }
  if (choice === BUILD_ANYWAY) {
    return 'build-anyway';
  }
  if (choice === DETAILS) {
    return 'details';
  }
  return 'switch';
}

export async function showDriftWarning(
  outcome: CheckedGuard,
): Promise<'details' | 'record' | undefined> {
  const buttons = outcome.severity === 'unknown' ? [RECORD, DETAILS] : [DETAILS];
  const choice = await vscode.window.showWarningMessage(
    `Shorebird Guard: ${describeDrift(outcome)}`,
    ...buttons,
  );
  if (choice === RECORD) {
    return 'record';
  }
  return choice === DETAILS ? 'details' : undefined;
}
