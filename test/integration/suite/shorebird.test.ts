import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { createLedgerService, type LedgerEntry } from '../../../src/services/ledgerService';
import { createLogger } from '../../../src/util/logger';
import { extension, registeredGuardCommands, waitFor } from './helpers';

const ALL_COMMANDS = [
  'shorebirdGuard.checkNow',
  'shorebirdGuard.patchIos',
  'shorebirdGuard.recordRelease',
  'shorebirdGuard.showLedger',
  'shorebirdGuard.showLogs',
  'shorebirdGuard.switchXcode',
];

const silent = createLogger({
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

suite('shorebird workspace', () => {
  test('activates on a workspace containing shorebird.yaml', async () => {
    await waitFor(() => extension()?.isActive === true);
    assert.equal(extension()?.isActive, true);
  });

  test('registers every command', async () => {
    await waitFor(async () => (await registeredGuardCommands()).length === ALL_COMMANDS.length);
    assert.deepEqual(await registeredGuardCommands(), ALL_COMMANDS);
  });

  test('ledger round-trips through the real workspace file', async () => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const ledgerPath = path.join(root, '.shorebird-guard', 'ledger.json');
    const entry: LedgerEntry = {
      xcodeVersion: '16.2',
      xcodeBuild: '16C5032a',
      flutterRevision: 'abc',
      shorebirdVersion: '1.6.116',
      macosVersion: '15.3',
      capturedAt: '2026-09-16T00:00:00.000Z',
      capturedBy: 'test',
    };
    const service = createLedgerService(silent);
    const written = await service.record(ledgerPath, 'app', '1.0.0+1', entry);
    assert.equal(written.ok, true);
    const text = await readFile(ledgerPath, 'utf8');
    assert.equal((JSON.parse(text) as { schemaVersion: number }).schemaVersion, 1);
    const read = await service.read(ledgerPath);
    assert.equal(read.ok && service.lookup(read.value, 'app', '1.0.0+1')?.xcodeBuild, '16C5032a');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(ledgerPath));
    assert.equal(doc.getText(), text);
  });

  test('showLedger opens the ledger document', async () => {
    await vscode.commands.executeCommand('shorebirdGuard.showLedger');
    await waitFor(
      () => vscode.window.activeTextEditor?.document.fileName.endsWith('ledger.json') === true,
    );
    assert.ok(vscode.window.activeTextEditor?.document.fileName.endsWith('ledger.json'));
  });

  test('showLogs does not throw', async () => {
    await vscode.commands.executeCommand('shorebirdGuard.showLogs');
  });
});
