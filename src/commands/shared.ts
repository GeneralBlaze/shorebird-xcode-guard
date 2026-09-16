import * as vscode from 'vscode';
import type { GuardController, CheckRequest } from '../guardController';
import type { GuardOutcome } from '../services/guardCheck';
import type { InstalledXcode, XcodeService } from '../services/xcodeService';
import type { StatusBar } from '../ui/statusBar';
import { pickApp, pickFlavor } from '../ui/quickPicks';
import type { Logger } from '../util/logger';

export interface CommandContext {
  readonly controller: GuardController;
  readonly statusBar: StatusBar;
  readonly xcode: XcodeService;
  readonly logger: Logger;
  readonly showLogs: () => void;
  readonly refreshStatusBar: () => Promise<void>;
}

export const isMac = (): boolean => process.platform === 'darwin';

export async function notApplicable(): Promise<void> {
  await vscode.window.showInformationMessage('Shorebird Guard only checks Xcode on macOS.');
}

export async function chooseRequest(
  controller: GuardController,
  allowFlavor: boolean,
): Promise<CheckRequest | undefined> {
  const app = controller.activeApp() ?? (await pickApp(controller.apps()));
  if (app === undefined) {
    return undefined;
  }
  if (!allowFlavor) {
    return { app };
  }
  const flavor = await pickFlavor(app);
  if (flavor === null) {
    return undefined;
  }
  return flavor === undefined ? { app } : { app, flavor };
}

export function appLabel(request: CheckRequest): string {
  const base = vscode.workspace.asRelativePath(request.app.root);
  return request.flavor === undefined ? base : `${base} (${request.flavor})`;
}

export function openSwitchTerminal(xcode: InstalledXcode): void {
  const terminal = vscode.window.createTerminal({ name: 'Shorebird Guard: switch Xcode' });
  terminal.show(true);
  terminal.sendText(`sudo xcode-select -s ${JSON.stringify(xcode.developerDir)}`, true);
}

export async function switchToRecorded(
  context: CommandContext,
  outcome: GuardOutcome,
): Promise<void> {
  if (outcome.state !== 'checked' || outcome.recorded === undefined) {
    return;
  }
  const installed = await context.xcode.installed();
  const target =
    installed.find((x) => x.build === outcome.recorded?.xcodeBuild) ??
    installed.find((x) => x.version === outcome.recorded?.xcodeVersion);
  if (target === undefined) {
    await vscode.window.showErrorMessage(
      `Xcode ${outcome.recorded.xcodeVersion} (${outcome.recorded.xcodeBuild}) is not installed under /Applications. Install it (for example with xcodes) and try again.`,
    );
    return;
  }
  openSwitchTerminal(target);
}
