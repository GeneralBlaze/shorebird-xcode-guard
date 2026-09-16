import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

const extensionDevelopmentPath = path.resolve(__dirname, '..', '..', '..');
const fixtures = path.resolve(extensionDevelopmentPath, 'test', 'integration', 'fixtures');
const workspacesRoot = path.resolve(extensionDevelopmentPath, '.vscode-test', 'workspaces');
const VSCODE_VERSION = '1.90.0';
const LAUNCH_ARGS = ['--disable-extensions', '--disable-workspace-trust'];

interface Scenario {
  readonly name: string;
  readonly suite: string;
  readonly workspace: () => string;
}

function tempCopy(name: string): string {
  const dir = mkdtempSync(path.join(workspacesRoot, `${name}-`));
  cpSync(path.join(fixtures, name), dir, { recursive: true });
  return dir;
}

function multiRootWorkspace(): string {
  const a = tempCopy('shorebird-app');
  const b = tempCopy('shorebird-app');
  const file = path.join(mkdtempSync(path.join(workspacesRoot, 'multi-')), 'multi.code-workspace');
  writeFileSync(file, JSON.stringify({ folders: [{ path: a }, { path: b }] }));
  return file;
}

const scenarios: readonly Scenario[] = [
  { name: 'shorebird-workspace', suite: 'shorebird', workspace: () => tempCopy('shorebird-app') },
  { name: 'plain-workspace', suite: 'plain', workspace: () => tempCopy('plain-app') },
  { name: 'multi-root', suite: 'multiRoot', workspace: multiRootWorkspace },
];

async function main(): Promise<void> {
  delete process.env['ELECTRON_RUN_AS_NODE'];
  mkdirSync(workspacesRoot, { recursive: true });
  for (const scenario of scenarios) {
    process.stdout.write(`\n=== integration: ${scenario.name}\n`);
    await runTests({
      version: VSCODE_VERSION,
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, 'suite', 'index'),
      extensionTestsEnv: { SXG_SUITE: scenario.suite },
      launchArgs: [scenario.workspace(), ...LAUNCH_ARGS],
    });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`integration tests failed: ${String(error)}\n`);
  process.exit(1);
});
