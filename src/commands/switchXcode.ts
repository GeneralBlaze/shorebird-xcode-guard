import * as vscode from 'vscode';
import { pickXcode } from '../ui/quickPicks';
import { isMac, notApplicable, openSwitchTerminal, type CommandContext } from './shared';

const DEFAULT_TIMEOUT_MS = 15000;

export function registerSwitchXcode(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand('shorebirdGuard.switchXcode', async () => {
    if (!isMac()) {
      await notApplicable();
      return;
    }
    const installed = await context.xcode.installed();
    if (installed.length === 0) {
      await vscode.window.showErrorMessage(
        'Shorebird Guard: no Xcode found under /Applications/Xcode*.app.',
      );
      return;
    }
    const firstApp = context.controller.apps()[0];
    const timeoutMs =
      firstApp === undefined
        ? DEFAULT_TIMEOUT_MS
        : context.controller.configFor(firstApp).cliTimeoutMs;
    const active = await context.xcode.active(timeoutMs);
    const activeDir = active.ok ? active.value.xcodeDeveloperDir : '';
    const picked = await pickXcode(installed, activeDir);
    if (picked === undefined) {
      return;
    }
    if (picked.developerDir === activeDir) {
      await vscode.window.showInformationMessage(`Xcode ${picked.version} is already active.`);
      return;
    }
    openSwitchTerminal(picked);
    context.logger.info(`switch requested: ${picked.developerDir}`);
  });
}
