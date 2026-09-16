import * as vscode from 'vscode';
import type { GuardOutcome } from '../services/guardCheck';

export interface StatusBar {
  readonly render: (outcome: GuardOutcome | undefined, appLabel: string) => void;
  readonly renderNotApplicable: () => void;
  readonly renderChecking: () => void;
  readonly setVisible: (visible: boolean) => void;
  readonly dispose: () => void;
}

const STATUS_BAR_PRIORITY = 100;

function tooltipFor(outcome: GuardOutcome, appLabel: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = true;
  md.appendMarkdown(`**Shorebird Guard** — ${appLabel}\n\n`);
  if (outcome.state === 'checked') {
    const recorded = outcome.recorded;
    md.appendMarkdown(`Target release: \`${outcome.targetRelease}\` — **${outcome.severity}**\n\n`);
    md.appendMarkdown('| | Current | Recorded |\n|---|---|---|\n');
    md.appendMarkdown(
      `| Xcode | ${outcome.current.xcodeVersion} | ${recorded?.xcodeVersion ?? '—'} |\n`,
    );
    md.appendMarkdown(
      `| Build | ${outcome.current.xcodeBuild} | ${recorded?.xcodeBuild ?? '—'} |\n`,
    );
    md.appendMarkdown(
      `| Flutter | ${outcome.current.flutterRevision.slice(0, 10)} | ${recorded?.flutterRevision.slice(0, 10) ?? '—'} |\n`,
    );
    md.appendMarkdown(
      `| Shorebird | ${outcome.current.shorebirdVersion} | ${recorded?.shorebirdVersion ?? '—'} |\n\n`,
    );
    if (!outcome.flutterRevisionMatches) {
      md.appendMarkdown('$(warning) Flutter revision differs from the release.\n\n');
    }
  } else if (outcome.state === 'cli-unavailable') {
    md.appendMarkdown(
      `Shorebird CLI unavailable (${outcome.reason.kind}). Xcode ${outcome.active.xcodeVersion} (${outcome.active.xcodeBuild}).\n\n`,
    );
  } else if (outcome.state === 'no-xcode') {
    md.appendMarkdown(`No usable Xcode (${outcome.reason.kind}).\n\n`);
  } else if (outcome.state === 'ledger-error') {
    md.appendMarkdown(`Ledger problem: ${outcome.reason.kind}.\n\n`);
  } else {
    md.appendMarkdown('No releases known yet. Record one after `shorebird release ios`.\n\n');
  }
  md.appendMarkdown(
    '[Check now](command:shorebirdGuard.checkNow) · [Record release](command:shorebirdGuard.recordRelease) · [Switch Xcode](command:shorebirdGuard.switchXcode) · [Logs](command:shorebirdGuard.showLogs)',
  );
  return md;
}

export function textFor(outcome: GuardOutcome): string {
  switch (outcome.state) {
    case 'checked': {
      const current = outcome.current.xcodeVersion;
      if (outcome.severity === 'ok' && outcome.flutterRevisionMatches) {
        return `$(shield) Xcode ${current}`;
      }
      if (outcome.severity === 'unknown') {
        return `$(shield) Xcode ${current} ?`;
      }
      const recorded = outcome.recorded?.xcodeVersion ?? '?';
      return outcome.severity === 'ok'
        ? `$(shield) Xcode ${current} ≠ Flutter`
        : `$(shield) Xcode ${current} ≠ ${recorded}`;
    }
    case 'cli-unavailable':
    case 'no-releases':
      return `$(shield) Xcode ${outcome.active.xcodeVersion} ?`;
    case 'no-xcode':
      return '$(shield) Xcode ?';
    case 'ledger-error':
      return '$(shield) Ledger !';
  }
}

export function backgroundFor(outcome: GuardOutcome): vscode.ThemeColor | undefined {
  if (outcome.state === 'ledger-error') {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  if (outcome.state !== 'checked') {
    return undefined;
  }
  if (outcome.action === 'block') {
    return new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  if (outcome.severity !== 'ok' && outcome.severity !== 'unknown') {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  return undefined;
}

export function createStatusBar(): StatusBar {
  const item = vscode.window.createStatusBarItem(
    'shorebirdGuard.status',
    vscode.StatusBarAlignment.Right,
    STATUS_BAR_PRIORITY,
  );
  item.name = 'Shorebird Guard';
  item.command = 'shorebirdGuard.checkNow';
  const state = { visible: true };
  const apply = (): void => (state.visible ? item.show() : item.hide());
  return {
    render: (outcome, appLabel) => {
      if (outcome === undefined) {
        item.text = '$(shield) Xcode ?';
        item.tooltip = 'Shorebird Guard: not checked yet';
        item.backgroundColor = undefined;
      } else {
        item.text = textFor(outcome);
        item.tooltip = tooltipFor(outcome, appLabel);
        item.backgroundColor = backgroundFor(outcome);
      }
      apply();
    },
    renderNotApplicable: () => {
      item.text = '$(shield) Xcode n/a';
      item.tooltip = 'Shorebird Guard only checks Xcode on macOS.';
      item.backgroundColor = undefined;
      apply();
    },
    renderChecking: () => {
      item.text = '$(sync~spin) Xcode';
      apply();
    },
    setVisible: (visible) => {
      state.visible = visible;
      apply();
    },
    dispose: () => item.dispose(),
  };
}
