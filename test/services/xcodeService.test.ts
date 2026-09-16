import { describe, expect, it } from 'vitest';
import { createXcodeService, type XcodeFileSystem } from '../../src/services/xcodeService';
import { capturedLogger, fakeExec, fixture, key, stdout } from './fakes';

const plist = (version: string, build: string): string =>
  `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${version}</string><key>ProductBuildVersion</key><string>${build}</string></dict></plist>`;

const fs = (apps: Readonly<Record<string, string>>): XcodeFileSystem => ({
  listApplications: () => Promise.resolve(Object.keys(apps)),
  readFile: (path) => {
    const app = Object.keys(apps).find(
      (name) => path === `/Applications/${name}/Contents/version.plist`,
    );
    return app === undefined
      ? Promise.reject(new Error('ENOENT'))
      : Promise.resolve(apps[app] ?? '');
  },
});

const macExec = (table: Readonly<Record<string, string>>) =>
  fakeExec((request) => {
    const body = table[key(request)];
    return body === undefined ? undefined : stdout(body);
  });

const timeout = 1000;

describe('xcodeService.active', () => {
  it('reads version, build and developer dir from the real captures', async () => {
    const { logger } = capturedLogger();
    const { exec } = macExec({
      'xcodebuild -version': fixture('xcodebuild-version.stdout.txt'),
      'xcode-select -p': fixture('xcode-select-p.stdout.txt'),
      'sw_vers -productVersion': fixture('sw_vers.stdout.txt'),
    });
    const result = await createXcodeService(exec, fs({}), logger).active(timeout);
    expect(result).toEqual({
      ok: true,
      value: {
        xcodeVersion: '26.3',
        xcodeBuild: '17C529',
        xcodeDeveloperDir: '/Applications/Xcode.app/Contents/Developer',
        macosVersion: '26.6',
      },
    });
  });

  it('reports command-line-tools when xcode-select points at CommandLineTools', async () => {
    const { logger } = capturedLogger();
    const { exec } = fakeExec((request) => {
      const k = key(request);
      if (k === 'xcode-select -p') return stdout('/Library/Developer/CommandLineTools\n');
      if (k === 'sw_vers -productVersion') return stdout('26.6\n');
      if (k === 'xcodebuild -version')
        return {
          ok: false,
          reason: {
            kind: 'exit',
            exitCode: 1,
            stdout: '',
            stderr:
              "xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance",
          },
        };
      return undefined;
    });
    const result = await createXcodeService(exec, fs({}), logger).active(timeout);
    expect(result).toEqual({
      ok: false,
      reason: {
        kind: 'command-line-tools-only',
        developerDir: '/Library/Developer/CommandLineTools',
      },
    });
  });

  it('reports no-xcode when xcodebuild is absent', async () => {
    const { logger } = capturedLogger();
    const { exec } = macExec({
      'xcode-select -p': '/Applications/Xcode.app/Contents/Developer\n',
      'sw_vers -productVersion': '26.6\n',
    });
    const result = await createXcodeService(exec, fs({}), logger).active(timeout);
    expect(result).toEqual({ ok: false, reason: { kind: 'no-xcode' } });
  });

  it('reports unexpected output when xcodebuild prints something new', async () => {
    const { logger, lines } = capturedLogger();
    const { exec } = macExec({
      'xcodebuild -version': 'Xcode Ultra Edition\n',
      'xcode-select -p': '/Applications/Xcode.app/Contents/Developer\n',
      'sw_vers -productVersion': '26.6\n',
    });
    const result = await createXcodeService(exec, fs({}), logger).active(timeout);
    expect(result).toEqual({
      ok: false,
      reason: { kind: 'unexpected-output', stdout: 'Xcode Ultra Edition\n' },
    });
    expect(lines.some((line) => line.startsWith('warn'))).toBe(true);
  });

  it('reports timeout', async () => {
    const { logger } = capturedLogger();
    const { exec } = fakeExec(() => ({
      ok: false,
      reason: { kind: 'timeout', timeoutMs: timeout },
    }));
    const result = await createXcodeService(exec, fs({}), logger).active(timeout);
    expect(result).toEqual({ ok: false, reason: { kind: 'timeout', timeoutMs: timeout } });
  });

  it('leaves macosVersion empty when sw_vers fails', async () => {
    const { logger } = capturedLogger();
    const { exec } = macExec({
      'xcodebuild -version': fixture('xcodebuild-version.stdout.txt'),
      'xcode-select -p': fixture('xcode-select-p.stdout.txt'),
    });
    const result = await createXcodeService(exec, fs({}), logger).active(timeout);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.macosVersion).toBe('');
    }
  });
});

describe('xcodeService.installed', () => {
  it('scans /Applications/Xcode*.app and reads version.plist', async () => {
    const { logger } = capturedLogger();
    const { exec } = macExec({});
    const result = await createXcodeService(
      exec,
      fs({
        'Xcode.app': fixture('xcode-version.plist'),
        'Xcode-16.2.app': plist('16.2', '16C5032a'),
        'Safari.app': 'nope',
      }),
      logger,
    ).installed();
    expect(result).toEqual([
      {
        path: '/Applications/Xcode-16.2.app',
        developerDir: '/Applications/Xcode-16.2.app/Contents/Developer',
        version: '16.2',
        build: '16C5032a',
      },
      {
        path: '/Applications/Xcode.app',
        developerDir: '/Applications/Xcode.app/Contents/Developer',
        version: '26.3',
        build: '17C529',
      },
    ]);
  });

  it('keeps two Xcodes with identical marketing version apart by build', async () => {
    const { logger } = capturedLogger();
    const { exec } = macExec({});
    const result = await createXcodeService(
      exec,
      fs({ 'Xcode.app': plist('16.2', '16C5032a'), 'Xcode-beta.app': plist('16.2', '16C5033b') }),
      logger,
    ).installed();
    expect(result.map((x) => x.build)).toEqual(['16C5033b', '16C5032a']);
  });

  it('skips apps whose plist is unreadable and logs', async () => {
    const { logger, lines } = capturedLogger();
    const { exec } = macExec({});
    const result = await createXcodeService(
      exec,
      fs({ 'Xcode.app': plist('16.2', '16C5032a'), 'Xcode-broken.app': '<plist>' }),
      logger,
    ).installed();
    expect(result).toHaveLength(1);
    expect(lines.some((line) => line.includes('Xcode-broken.app'))).toBe(true);
  });

  it('returns empty when no Xcode is installed', async () => {
    const { logger } = capturedLogger();
    const { exec } = macExec({});
    expect(await createXcodeService(exec, fs({ 'Safari.app': '' }), logger).installed()).toEqual(
      [],
    );
  });

  it('returns empty when /Applications cannot be listed', async () => {
    const { logger } = capturedLogger();
    const { exec } = macExec({});
    const broken: XcodeFileSystem = {
      listApplications: () => Promise.reject(new Error('EACCES')),
      readFile: () => Promise.reject(new Error('x')),
    };
    expect(await createXcodeService(exec, broken, logger).installed()).toEqual([]);
  });
});
