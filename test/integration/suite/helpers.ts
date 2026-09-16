import * as vscode from 'vscode';

export const EXTENSION_ID = 'nexcyph.shorebird-xcode-guard';

export const extension = (): vscode.Extension<unknown> | undefined =>
  vscode.extensions.getExtension(EXTENSION_ID);

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 20000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('waitFor timed out');
}

export async function registeredGuardCommands(): Promise<readonly string[]> {
  const all = await vscode.commands.getCommands(true);
  return all.filter((id) => id.startsWith('shorebirdGuard.')).sort();
}
