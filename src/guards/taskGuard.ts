import * as vscode from 'vscode';
import { overrideKey } from '../guardController';
import { resolveAppForPath } from '../services/workspaceService';
import { showBlockingModal } from '../ui/notifications';
import { switchToRecorded, type CommandContext } from '../commands/shared';

const PATCH_IOS =
  /\bshorebird\b[^\n;&|]*\bpatch\b[^\n;&|]*\b(ios|--platforms?[= ]+\S*ios|-p[= ]+\S*ios)\b/;
const FLAVOR = /--flavor[= ]+(\S+)/;

export function taskCommandLine(task: vscode.Task): string {
  const execution = task.execution;
  if (execution instanceof vscode.ShellExecution) {
    const command =
      execution.commandLine ??
      [execution.command, ...(execution.args ?? [])]
        .map((part) => (typeof part === 'string' ? part : (part?.value ?? '')))
        .join(' ');
    return command ?? '';
  }
  if (execution instanceof vscode.ProcessExecution) {
    return [execution.process, ...execution.args].join(' ');
  }
  const definition = task.definition as { readonly command?: unknown; readonly args?: unknown };
  const args = Array.isArray(definition.args) ? definition.args.map(String).join(' ') : '';
  return typeof definition.command === 'string' ? `${definition.command} ${args}` : '';
}

export const isPatchIosCommand = (commandLine: string): boolean => PATCH_IOS.test(commandLine);

function taskRoot(task: vscode.Task): string | undefined {
  const scope = task.scope;
  return typeof scope === 'object' && 'uri' in scope ? scope.uri.fsPath : undefined;
}

export function registerTaskGuard(context: CommandContext): vscode.Disposable {
  return vscode.tasks.onDidStartTaskProcess(async (event) => {
    const task = event.execution.task;
    const commandLine = taskCommandLine(task);
    if (!isPatchIosCommand(commandLine) || process.platform !== 'darwin') {
      return;
    }
    const app =
      resolveAppForPath(context.controller.apps(), taskRoot(task)) ??
      context.controller.activeApp();
    if (app === undefined || !context.controller.configFor(app).enabled) {
      return;
    }
    const flavor = FLAVOR.exec(commandLine)?.[1];
    const request = flavor === undefined ? { app } : { app, flavor };
    const outcome = await context.controller.check(request);
    context.statusBar.render(outcome, vscode.workspace.asRelativePath(app.root));
    if (outcome.state !== 'checked' || outcome.action !== 'block') {
      return;
    }
    const key = overrideKey(outcome, context.controller.appIdFor(app, flavor));
    if (context.controller.isOverridden(key)) {
      return;
    }
    event.execution.terminate();
    context.logger.warn(
      `terminated task "${task.name}" (${commandLine}) because of ${outcome.severity}`,
    );
    const choice = await showBlockingModal(outcome, `task "${task.name}"`);
    if (choice === 'build-anyway') {
      context.controller.override(key);
      await vscode.tasks.executeTask(task);
    } else if (choice === 'switch') {
      await switchToRecorded(context, outcome);
    } else if (choice === 'details') {
      context.showLogs();
    }
  });
}
