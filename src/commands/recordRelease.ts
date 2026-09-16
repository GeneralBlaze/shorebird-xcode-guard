import * as vscode from 'vscode';
import { pickRelease } from '../ui/quickPicks';
import { chooseRequest, isMac, notApplicable, type CommandContext } from './shared';

export function registerRecordRelease(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand('shorebirdGuard.recordRelease', async () => {
    if (!isMac()) {
      await notApplicable();
      return;
    }
    const request = await chooseRequest(context.controller, true);
    if (request === undefined) {
      return;
    }
    const release = await pickRelease(await context.controller.knownReleases(request));
    if (release === undefined) {
      return;
    }
    const result = await context.controller.record(request, release);
    if (!result.ok) {
      await vscode.window
        .showErrorMessage(`Shorebird Guard: ${result.reason}`, 'Show logs')
        .then((c) => c && context.showLogs());
      return;
    }
    await vscode.window.showInformationMessage(
      `Recorded Xcode ${result.value.xcodeVersion} (${result.value.xcodeBuild}) for release ${release} in ${vscode.workspace.asRelativePath(context.controller.ledgerPathFor(request.app))}.`,
    );
    await context.refreshStatusBar();
  });
}
