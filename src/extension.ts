import * as vscode from 'vscode';
import { registerCheckNow } from './commands/checkNow';
import { registerPatchIos } from './commands/patchIos';
import { registerRecordRelease } from './commands/recordRelease';
import { appLabel, isMac, type CommandContext } from './commands/shared';
import { registerShowLedger } from './commands/showLedger';
import { registerSwitchXcode } from './commands/switchXcode';
import { createGuardController, type GuardController } from './guardController';
import { registerTaskGuard } from './guards/taskGuard';
import { createLedgerService } from './services/ledgerService';
import { createShorebirdService } from './services/shorebirdService';
import { createXcodeService, nodeXcodeFileSystem } from './services/xcodeService';
import { createStatusBar, textFor, type StatusBar } from './ui/statusBar';
import { createExec } from './util/exec';
import { createLogger, type Logger } from './util/logger';

const CONTEXT_KEY = 'shorebirdGuard:isShorebirdWorkspace';

async function refreshStatusBar(
  controller: GuardController,
  statusBar: StatusBar,
  logger: Logger,
): Promise<void> {
  const app = controller.activeApp() ?? controller.apps()[0];
  if (app === undefined) {
    statusBar.setVisible(false);
    return;
  }
  const config = controller.configFor(app);
  statusBar.setVisible(config.enabled && config.statusBarEnabled);
  if (!isMac()) {
    statusBar.renderNotApplicable();
    return;
  }
  statusBar.renderChecking();
  const outcome = await controller.check({ app }).catch((error: unknown) => {
    logger.error(`check failed: ${String(error)}`);
    return undefined;
  });
  statusBar.render(outcome, appLabel({ app }));
  logger.info(`status bar: ${outcome === undefined ? 'unavailable' : textFor(outcome)}`);
}

async function refreshWorkspace(
  controller: GuardController,
  statusBar: StatusBar,
  logger: Logger,
): Promise<void> {
  const apps = await controller.refreshApps();
  await vscode.commands.executeCommand('setContext', CONTEXT_KEY, apps.length > 0);
  await refreshStatusBar(controller, statusBar, logger);
}

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel('Shorebird Guard', { log: true });
  const logger = createLogger(channel);
  const exec = createExec();
  const controller = createGuardController({
    xcode: createXcodeService(exec, nodeXcodeFileSystem, logger),
    shorebird: createShorebirdService(exec, logger),
    ledger: createLedgerService(logger),
    logger,
  });
  const statusBar = createStatusBar();
  const commandContext: CommandContext = {
    controller,
    statusBar,
    xcode: createXcodeService(exec, nodeXcodeFileSystem, logger),
    logger,
    showLogs: () => channel.show(),
    refreshStatusBar: () => refreshStatusBar(controller, statusBar, logger),
  };
  const yamlWatcher = vscode.workspace.createFileSystemWatcher('**/shorebird.yaml');
  const ledgerWatcher = vscode.workspace.createFileSystemWatcher('**/.shorebird-guard/ledger.json');
  const refreshAll = (): void => void refreshWorkspace(controller, statusBar, logger);
  const refreshBar = (): void => void commandContext.refreshStatusBar();
  const editorState = { app: controller.activeApp()?.root };
  context.subscriptions.push(
    channel,
    statusBar,
    yamlWatcher,
    ledgerWatcher,
    registerCheckNow(commandContext),
    registerPatchIos(commandContext),
    registerRecordRelease(commandContext),
    registerSwitchXcode(commandContext),
    registerShowLedger(commandContext),
    vscode.commands.registerCommand('shorebirdGuard.showLogs', () => channel.show()),
    registerTaskGuard(commandContext),
    yamlWatcher.onDidCreate(refreshAll),
    yamlWatcher.onDidDelete(refreshAll),
    yamlWatcher.onDidChange(refreshAll),
    ledgerWatcher.onDidChange(refreshBar),
    ledgerWatcher.onDidCreate(refreshBar),
    vscode.workspace.onDidChangeWorkspaceFolders(refreshAll),
    vscode.workspace.onDidChangeConfiguration(
      (e) => e.affectsConfiguration('shorebirdGuard') && refreshBar(),
    ),
    vscode.window.onDidChangeWindowState((s) => s.focused && refreshBar()),
    vscode.window.onDidChangeActiveTextEditor(() => {
      const next = controller.activeApp()?.root;
      if (next !== undefined && next !== editorState.app) {
        editorState.app = next;
        refreshBar();
      }
    }),
  );
  logger.info(`Shorebird Guard activating (${process.platform})`);
  refreshAll();
}

export function deactivate(): void {
  return undefined;
}
