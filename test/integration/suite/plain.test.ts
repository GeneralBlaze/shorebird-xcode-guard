import * as assert from 'node:assert/strict';
import { extension, registeredGuardCommands } from './helpers';

const SETTLE_MS = 3000;

suite('plain workspace', () => {
  test('does not activate without shorebird.yaml', async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    assert.equal(extension()?.isActive, false);
  });

  test('registers no commands', async () => {
    assert.deepEqual(await registeredGuardCommands(), []);
  });
});
