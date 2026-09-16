import * as vscode from 'vscode';
import type { ShorebirdApp } from '../services/workspaceService';
import type { InstalledXcode } from '../services/xcodeService';

interface XcodeItem extends vscode.QuickPickItem {
  readonly xcode: InstalledXcode;
}

const MANUAL_ENTRY = '$(edit) Enter a release version…';

export async function pickXcode(
  installed: readonly InstalledXcode[],
  activeDeveloperDir: string,
  preferredBuild?: string,
): Promise<InstalledXcode | undefined> {
  const items: XcodeItem[] = installed.map((xcode) => ({
    label: `Xcode ${xcode.version}`,
    description: xcode.build,
    detail: xcode.path + (xcode.developerDir === activeDeveloperDir ? '  (active)' : ''),
    picked: xcode.build === preferredBuild,
    xcode,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select the Xcode to make active (runs sudo xcode-select -s)',
  });
  return picked?.xcode;
}

export async function pickApp(apps: readonly ShorebirdApp[]): Promise<ShorebirdApp | undefined> {
  if (apps.length === 1) {
    return apps[0];
  }
  const picked = await vscode.window.showQuickPick(
    apps.map((app) => ({
      label: vscode.workspace.asRelativePath(app.root),
      description: app.appId,
      app,
    })),
    { placeHolder: 'Select the Shorebird app' },
  );
  return picked?.app;
}

export async function pickFlavor(app: ShorebirdApp): Promise<string | undefined | null> {
  const flavors = Object.keys(app.flavors);
  if (flavors.length === 0) {
    return undefined;
  }
  const items: vscode.QuickPickItem[] = flavors.map((flavor) => ({
    label: flavor,
    description: app.flavors[flavor] ?? '',
  }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select the flavor' });
  return picked === undefined ? null : picked.label;
}

export async function pickRelease(known: readonly string[]): Promise<string | undefined> {
  const picked = await vscode.window.showQuickPick([...known, MANUAL_ENTRY], {
    placeHolder: 'Release version to record the current toolchain against',
  });
  if (picked === undefined) {
    return undefined;
  }
  if (picked !== MANUAL_ENTRY) {
    return picked;
  }
  const typed = await vscode.window.showInputBox({
    prompt: 'Release version, e.g. 1.4.2+18',
    validateInput: (v) => (v.trim() === '' ? 'Required' : undefined),
  });
  return typed?.trim();
}
