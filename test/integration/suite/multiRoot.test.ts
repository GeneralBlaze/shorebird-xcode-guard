import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { parseShorebirdYaml, resolveAppForPath } from '../../../src/services/workspaceService';
import { extension, waitFor } from './helpers';

suite('multi-root workspace', () => {
  test('activates and sees both folders', async () => {
    await waitFor(() => extension()?.isActive === true);
    assert.equal(vscode.workspace.workspaceFolders?.length, 2);
  });

  test('resolves the app from the active editor', async () => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const files = await vscode.workspace.findFiles('**/shorebird.yaml');
    assert.equal(files.length, 2);
    const apps = await Promise.all(
      files.map(async (uri) =>
        parseShorebirdYaml(
          uri.fsPath,
          Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'),
        ),
      ),
    );
    const second = folders[1]?.uri.fsPath ?? '';
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(second, 'pubspec.yaml')),
    );
    await vscode.window.showTextDocument(doc);
    const resolved = resolveAppForPath(
      apps.flatMap((a) => (a === undefined ? [] : [a])),
      vscode.window.activeTextEditor?.document.uri.fsPath,
    );
    assert.equal(resolved?.root, second);
  });
});
