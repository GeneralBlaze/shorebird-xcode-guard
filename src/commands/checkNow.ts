import * as vscode from 'vscode';
import { overrideKey } from '../guardController';
import { showDriftWarning } from '../ui/notifications';
import { appLabel, chooseRequest, isMac, notApplicable, type CommandContext } from './shared';

export function registerCheckNow(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand('shorebirdGuard.checkNow', async () => {
    if (!isMac()) {
      await notApplicable();
      return;
    }
    const request = await chooseRequest(context.controller, false);
    if (request === undefined) {
      return;
    }
    context.statusBar.renderChecking();
    const outcome = await context.controller.check(request);
    context.statusBar.render(outcome, appLabel(request));
    if (outcome.state !== 'checked') {
      await vscode.window
        .showInformationMessage(
          `Shorebird Guard: ${outcome.state.replace('-', ' ')}. See logs for details.`,
          'Show logs',
        )
        .then((c) => c && context.showLogs());
      return;
    }
    if (outcome.action === 'allow') {
      await vscode.window.showInformationMessage(
        `Shorebird Guard: Xcode ${outcome.current.xcodeVersion} (${outcome.current.xcodeBuild}) matches release ${outcome.targetRelease}.`,
      );
      return;
    }
    const key = overrideKey(outcome, context.controller.appIdFor(request.app, request.flavor));
    context.controller.dismiss(key);
    const choice = await showDriftWarning(outcome);
    if (choice === 'details') {
      context.showLogs();
    } else if (choice === 'record') {
      await vscode.commands.executeCommand('shorebirdGuard.recordRelease');
    }
  });
}
