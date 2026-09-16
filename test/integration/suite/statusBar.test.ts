import * as assert from 'node:assert/strict';
import type * as vscode from 'vscode';
import type { CheckedGuard, GuardOutcome } from '../../../src/services/guardCheck';
import { backgroundFor, textFor } from '../../../src/ui/statusBar';

const current = {
  xcodeVersion: '16.2',
  xcodeBuild: '16C5032a',
  xcodeDeveloperDir: '/x',
  flutterRevision: 'r',
  shorebirdVersion: '1.6.116',
  macosVersion: '15.3',
  capturedAt: '',
};

const recorded = {
  xcodeVersion: '16.1',
  xcodeBuild: '16B40',
  flutterRevision: 'r',
  shorebirdVersion: '1.6.116',
  macosVersion: '15.3',
  capturedAt: '',
  capturedBy: '',
};

const checked = (overrides: Partial<CheckedGuard>): GuardOutcome => ({
  state: 'checked',
  targetRelease: '1.0.0+1',
  current,
  recorded,
  severity: 'ok',
  flutterRevisionMatches: true,
  action: 'allow',
  ...overrides,
});

const colourId = (colour: vscode.ThemeColor | undefined): string | undefined =>
  (colour as { id?: string } | undefined)?.id;

suite('status bar rendering', () => {
  test('aligned', () => {
    const outcome = checked({
      recorded: { ...recorded, xcodeVersion: '16.2', xcodeBuild: '16C5032a' },
    });
    assert.equal(textFor(outcome), '$(shield) Xcode 16.2');
    assert.equal(backgroundFor(outcome), undefined);
  });

  test('warning drift', () => {
    const outcome = checked({ severity: 'patch-drift', action: 'warn' });
    assert.equal(textFor(outcome), '$(shield) Xcode 16.2 ≠ 16.1');
    assert.equal(colourId(backgroundFor(outcome)), 'statusBarItem.warningBackground');
  });

  test('blocking drift', () => {
    const outcome = checked({ severity: 'minor-drift', action: 'block' });
    assert.equal(textFor(outcome), '$(shield) Xcode 16.2 ≠ 16.1');
    assert.equal(colourId(backgroundFor(outcome)), 'statusBarItem.errorBackground');
  });

  test('unknown', () => {
    const outcome = checked({ severity: 'unknown', action: 'warn', recorded: undefined });
    assert.equal(textFor(outcome), '$(shield) Xcode 16.2 ?');
    assert.equal(backgroundFor(outcome), undefined);
  });

  test('cli unavailable', () => {
    const outcome: GuardOutcome = {
      state: 'cli-unavailable',
      active: { ...current },
      reason: { kind: 'cli-missing', command: 'shorebird' },
    };
    assert.equal(textFor(outcome), '$(shield) Xcode 16.2 ?');
    assert.equal(backgroundFor(outcome), undefined);
  });

  test('no xcode', () => {
    const outcome: GuardOutcome = { state: 'no-xcode', reason: { kind: 'no-xcode' } };
    assert.equal(textFor(outcome), '$(shield) Xcode ?');
  });

  test('ledger error', () => {
    const outcome: GuardOutcome = {
      state: 'ledger-error',
      reason: { kind: 'corrupt', path: '/l' },
    };
    assert.equal(textFor(outcome), '$(shield) Ledger !');
    assert.equal(colourId(backgroundFor(outcome)), 'statusBarItem.warningBackground');
  });
});
