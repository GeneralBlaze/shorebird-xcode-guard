import * as vscode from 'vscode';
import type { DriftPolicy, DriftThreshold } from './domain/driftPolicy';

export interface GuardConfig {
  readonly enabled: boolean;
  readonly policy: DriftPolicy;
  readonly ledgerPath: string;
  readonly shorebirdPath: string;
  readonly checkFlutterRevision: boolean;
  readonly statusBarEnabled: boolean;
  readonly cliTimeoutMs: number;
  readonly trace: 'off' | 'messages' | 'verbose';
}

const THRESHOLDS: readonly DriftThreshold[] = [
  'never',
  'major-drift',
  'minor-drift',
  'patch-drift',
];

const threshold = (value: unknown, fallback: DriftThreshold): DriftThreshold =>
  THRESHOLDS.find((t) => t === value) ?? fallback;

export function readConfig(scope: vscode.Uri | undefined): GuardConfig {
  const config = vscode.workspace.getConfiguration('shorebirdGuard', scope);
  const trace = config.get<string>('trace', 'off');
  return {
    enabled: config.get<boolean>('enabled', true),
    policy: {
      blockOn: threshold(config.get('blockOn'), 'minor-drift'),
      warnOn: threshold(config.get('warnOn'), 'patch-drift'),
    },
    ledgerPath: config.get<string>('ledgerPath', '.shorebird-guard/ledger.json'),
    shorebirdPath: config.get<string>('shorebirdPath', 'shorebird'),
    checkFlutterRevision: config.get<boolean>('checkFlutterRevision', true),
    statusBarEnabled: config.get<boolean>('statusBar.enabled', true),
    cliTimeoutMs: Math.max(1000, config.get<number>('cliTimeoutMs', 15000)),
    trace: trace === 'messages' || trace === 'verbose' ? trace : 'off',
  };
}
