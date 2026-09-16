import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Manifest {
  readonly activationEvents: readonly string[];
  readonly capabilities: { readonly untrustedWorkspaces: { readonly supported: boolean } };
  readonly contributes: {
    readonly commands: readonly { readonly command: string }[];
    readonly menus: {
      readonly commandPalette: readonly { readonly command: string; readonly when: string }[];
    };
    readonly configuration: {
      readonly properties: Readonly<Record<string, { readonly scope: string }>>;
    };
  };
}

const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as Manifest;

describe('package.json manifest', () => {
  it('activates only on shorebird.yaml', () => {
    expect(manifest.activationEvents).toEqual(['workspaceContains:**/shorebird.yaml']);
  });

  it('does not support untrusted workspaces', () => {
    expect(manifest.capabilities.untrustedWorkspaces.supported).toBe(false);
  });

  it('gates every command on the workspace context key', () => {
    const commands = manifest.contributes.commands.map((c) => c.command).sort();
    const gated = manifest.contributes.menus.commandPalette
      .filter((m) => m.when === 'shorebirdGuard:isShorebirdWorkspace')
      .map((m) => m.command)
      .sort();
    expect(gated).toEqual(commands);
  });

  it('scopes every setting to resource', () => {
    expect(
      Object.values(manifest.contributes.configuration.properties).every(
        (p) => p.scope === 'resource',
      ),
    ).toBe(true);
  });
});
