import * as vscode from 'vscode';
import { overrideKey, type CheckRequest } from '../guardController';
import type { GuardOutcome } from '../services/guardCheck';
import { showBlockingModal, showDriftWarning } from '../ui/notifications';
import {
  appLabel,
  chooseRequest,
  isMac,
  notApplicable,
  switchToRecorded,
  type CommandContext,
} from './shared';

function patchCommandLine(request: CheckRequest, shorebirdPath: string): string {
  const flavor = request.flavor === undefined ? '' : ` --flavor ${request.flavor}`;
  return `${JSON.stringify(shorebirdPath)} patch ios${flavor}`;
}

function launch(request: CheckRequest, shorebirdPath: string): void {
  const terminal = vscode.window.createTerminal({
    name: `Shorebird patch: ${appLabel(request)}`,
    cwd: request.app.root,
  });
  terminal.show(true);
  terminal.sendText(patchCommandLine(request, shorebirdPath), true);
}

async function decide(
  context: CommandContext,
  request: CheckRequest,
  outcome: GuardOutcome,
): Promise<boolean> {
  if (outcome.state !== 'checked') {
    const choice = await vscode.window.showWarningMessage(
      `Shorebird Guard cannot verify the toolchain (${outcome.state.replace(/-/g, ' ')}). Continue with the patch anyway?`,
      'Continue',
      'Show logs',
    );
    if (choice === 'Show logs') {
      context.showLogs();
    }
    return choice === 'Continue';
  }
  const key = overrideKey(outcome, context.controller.appIdFor(request.app, request.flavor));
  if (outcome.action === 'allow' || context.controller.isOverridden(key)) {
    return true;
  }
  if (outcome.action === 'warn') {
    if (!context.controller.isDismissed(key)) {
      context.controller.dismiss(key);
      const choice = await showDriftWarning(outcome);
      if (choice === 'details') {
        context.showLogs();
      }
    }
    return true;
  }
  const choice = await showBlockingModal(outcome, `the iOS patch for ${appLabel(request)}`);
  if (choice === 'build-anyway') {
    context.controller.override(key);
    context.logger.warn(`override recorded for ${key}`);
    return true;
  }
  if (choice === 'switch') {
    await switchToRecorded(context, outcome);
  } else if (choice === 'details') {
    context.showLogs();
  }
  return false;
}

export function registerPatchIos(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand('shorebirdGuard.patchIos', async () => {
    if (!isMac()) {
      await notApplicable();
      return;
    }
    const request = await chooseRequest(context.controller, true);
    if (request === undefined) {
      return;
    }
    context.statusBar.renderChecking();
    const outcome = await context.controller.check(request);
    context.statusBar.render(outcome, appLabel(request));
    if (await decide(context, request, outcome)) {
      launch(request, context.controller.configFor(request.app).shorebirdPath);
    }
  });
}
