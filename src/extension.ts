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

interface Refreshers {
  readonly all: () => void;
  readonly bar: () => void;
}

function createRefreshers(commandContext: CommandContext): Refreshers {
  const { controller, statusBar, logger } = commandContext;
  return {
    all: () => {
      refreshWorkspace(controller, statusBar, logger).catch((error: unknown) =>
        logger.error(`workspace refresh failed: ${String(error)}`),
      );
    },
    bar: () => {
      commandContext
        .refreshStatusBar()
        .catch((error: unknown) => logger.error(`status refresh failed: ${String(error)}`));
    },
  };
}

function registerListeners(
  commandContext: CommandContext,
  refresh: Refreshers,
): readonly vscode.Disposable[] {
  const { controller } = commandContext;
  const yamlWatcher = vscode.workspace.createFileSystemWatcher('**/shorebird.yaml');
  const ledgerWatcher = vscode.workspace.createFileSystemWatcher('**/.shorebird-guard/ledger.json');
  const editorState = { app: controller.activeApp()?.root };
  return [
    yamlWatcher,
    ledgerWatcher,
    yamlWatcher.onDidCreate(refresh.all),
    yamlWatcher.onDidDelete(refresh.all),
    yamlWatcher.onDidChange(refresh.all),
    ledgerWatcher.onDidChange(refresh.bar),
    ledgerWatcher.onDidCreate(refresh.bar),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh.all),
    vscode.workspace.onDidChangeConfiguration(
      (e) => e.affectsConfiguration('shorebirdGuard') && refresh.bar(),
    ),
    vscode.window.onDidChangeWindowState((s) => s.focused && refresh.bar()),
    vscode.window.onDidChangeActiveTextEditor(() => {
      const next = controller.activeApp()?.root;
      if (next !== undefined && next !== editorState.app) {
        editorState.app = next;
        refresh.bar();
      }
    }),
  ];
}

function registerCommands(
  commandContext: CommandContext,
  showLogs: () => void,
): readonly vscode.Disposable[] {
  return [
    registerCheckNow(commandContext),
    registerPatchIos(commandContext),
    registerRecordRelease(commandContext),
    registerSwitchXcode(commandContext),
    registerShowLedger(commandContext),
    vscode.commands.registerCommand('shorebirdGuard.showLogs', showLogs),
    registerTaskGuard(commandContext),
  ];
}

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel('Shorebird Guard', { log: true });
  const logger = createLogger(channel);
  const exec = createExec();
  const xcode = createXcodeService(exec, nodeXcodeFileSystem, logger);
  const controller = createGuardController({
    xcode,
    shorebird: createShorebirdService(exec, logger),
    ledger: createLedgerService(logger),
    logger,
  });
  const statusBar = createStatusBar();
  const showLogs = (): void => channel.show();
  const commandContext: CommandContext = {
    controller,
    statusBar,
    xcode,
    logger,
    showLogs,
    refreshStatusBar: () => refreshStatusBar(controller, statusBar, logger),
  };
  const refresh = createRefreshers(commandContext);
  context.subscriptions.push(
    channel,
    statusBar,
    { dispose: () => controller.dispose() },
    ...registerCommands(commandContext, showLogs),
    ...registerListeners(commandContext, refresh),
  );
  logger.info(`Shorebird Guard activating (${process.platform})`);
  refresh.all();
}

export function deactivate(): void {
  return undefined;
}
