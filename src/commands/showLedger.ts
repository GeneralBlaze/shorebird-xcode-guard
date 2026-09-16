import * as vscode from 'vscode';
import { pickApp } from '../ui/quickPicks';
import type { CommandContext } from './shared';

export function registerShowLedger(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand('shorebirdGuard.showLedger', async () => {
    const app = context.controller.activeApp() ?? (await pickApp(context.controller.apps()));
    if (app === undefined) {
      return;
    }
    const uri = vscode.Uri.file(context.controller.ledgerPathFor(app));
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      const choice = await vscode.window.showInformationMessage(
        `No ledger yet at ${vscode.workspace.asRelativePath(uri)}.`,
        'Record a release',
      );
      if (choice !== undefined) {
        await vscode.commands.executeCommand('shorebirdGuard.recordRelease');
      }
      return;
    }
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
  });
}
