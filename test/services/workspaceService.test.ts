import { describe, expect, it } from 'vitest';
import {
  parseShorebirdYaml,
  resolveAppForPath,
  type ShorebirdApp,
} from '../../src/services/workspaceService';

const yaml = `# comment
app_id: 16bfb68d-f517-42de-99ab-7c7ccee57f86
flavors:
  dev: 16bfb68d-f517-42de-99ab-7c7ccee57f86
  prod: 96f40e88-d2e3-432a-98db-5e8a58901f86

# auto_update: false
`;

describe('parseShorebirdYaml', () => {
  it('reads app_id and flavors from the real shape', () => {
    expect(parseShorebirdYaml('/repo/apps/leader/shorebird.yaml', yaml)).toEqual({
      root: '/repo/apps/leader',
      yamlPath: '/repo/apps/leader/shorebird.yaml',
      appId: '16bfb68d-f517-42de-99ab-7c7ccee57f86',
      flavors: {
        dev: '16bfb68d-f517-42de-99ab-7c7ccee57f86',
        prod: '96f40e88-d2e3-432a-98db-5e8a58901f86',
      },
    });
  });

  it('reads a flavorless file', () => {
    expect(parseShorebirdYaml('/repo/shorebird.yaml', 'app_id: abc\nauto_update: false\n')).toEqual(
      {
        root: '/repo',
        yamlPath: '/repo/shorebird.yaml',
        appId: 'abc',
        flavors: {},
      },
    );
  });

  it('strips quotes around values', () => {
    expect(parseShorebirdYaml('/r/shorebird.yaml', 'app_id: "abc"\n')?.appId).toBe('abc');
  });

  it('returns undefined when app_id is missing', () => {
    expect(parseShorebirdYaml('/r/shorebird.yaml', 'flavors:\n  dev: x\n')).toBeUndefined();
  });

  it('returns undefined for empty input', () => {
    expect(parseShorebirdYaml('/r/shorebird.yaml', '')).toBeUndefined();
  });
});

describe('resolveAppForPath', () => {
  const apps: readonly ShorebirdApp[] = [
    {
      root: '/repo/apps/leader',
      yamlPath: '/repo/apps/leader/shorebird.yaml',
      appId: 'leader',
      flavors: {},
    },
    {
      root: '/repo/apps/member',
      yamlPath: '/repo/apps/member/shorebird.yaml',
      appId: 'member',
      flavors: {},
    },
    { root: '/repo', yamlPath: '/repo/shorebird.yaml', appId: 'root', flavors: {} },
  ];

  it('picks the deepest app containing the path', () => {
    expect(resolveAppForPath(apps, '/repo/apps/member/lib/main.dart')?.appId).toBe('member');
  });

  it('falls back to the enclosing app', () => {
    expect(resolveAppForPath(apps, '/repo/packages/shared/x.dart')?.appId).toBe('root');
  });

  it('does not match a sibling prefix', () => {
    expect(resolveAppForPath(apps.slice(0, 2), '/repo/apps/leader-old/x.dart')).toBeUndefined();
  });

  it('returns the only app when path is undefined and one app exists', () => {
    expect(resolveAppForPath(apps.slice(0, 1), undefined)?.appId).toBe('leader');
  });

  it('returns undefined when path is undefined and several apps exist', () => {
    expect(resolveAppForPath(apps, undefined)).toBeUndefined();
  });
});
