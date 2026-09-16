import { describe, expect, it } from 'vitest';
import { createShorebirdService } from '../../src/services/shorebirdService';
import { createCancellationSource } from '../../src/util/cancellation';
import { capturedLogger, fakeExec, fixture, key, stdout } from './fakes';

const CWD = '/tmp/app';
const options = { shorebirdPath: 'shorebird', timeoutMs: 1000 };

const cli = (table: Readonly<Record<string, string>>) =>
  fakeExec((request) => {
    const body = table[key(request)];
    return body === undefined ? undefined : stdout(body);
  });

describe('shorebirdService.version', () => {
  it('reads shorebird and flutter revision from --version --json', async () => {
    const { logger } = capturedLogger();
    const { exec } = cli({ 'shorebird --version --json': fixture('version-json.stdout.txt') });
    const service = createShorebirdService(exec, logger);
    const result = await service.version(options, CWD);
    expect(result).toEqual({
      ok: true,
      value: {
        shorebirdVersion: '1.6.116',
        flutterVersion: '3.44.9',
        flutterRevision: 'c2515c46c7fca511e39735a615f0f12f3dca6230',
      },
    });
  });

  it('degrades to cli-missing when shorebird is not on PATH', async () => {
    const { logger, lines } = capturedLogger();
    const { exec } = cli({});
    const result = await createShorebirdService(exec, logger).version(options, CWD);
    expect(result).toEqual({ ok: false, reason: { kind: 'cli-missing', command: 'shorebird' } });
    expect(lines.some((line) => line.includes('not found'))).toBe(true);
  });

  it('reports timeout cleanly', async () => {
    const { logger } = capturedLogger();
    const { exec } = fakeExec(() => ({ ok: false, reason: { kind: 'timeout', timeoutMs: 1000 } }));
    const result = await createShorebirdService(exec, logger).version(options, CWD);
    expect(result).toEqual({ ok: false, reason: { kind: 'timeout', timeoutMs: 1000 } });
  });

  it('reports unexpected output shape and logs the CLI version', async () => {
    const { logger, lines } = capturedLogger();
    const { exec } = cli({
      'shorebird --version --json':
        '{"status":"success","data":{"unexpected":true},"meta":{"version":"9.9.9","command":"version"}}',
    });
    const result = await createShorebirdService(exec, logger).version(options, CWD);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.kind).toBe('unexpected-output');
    }
    expect(lines.some((line) => line.includes('9.9.9'))).toBe(true);
  });

  it('reports invalid JSON as unexpected output', async () => {
    const { logger } = capturedLogger();
    const { exec } = cli({ 'shorebird --version --json': fixture('version.stdout.txt') });
    const result = await createShorebirdService(exec, logger).version(options, CWD);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.kind).toBe('unexpected-output');
    }
  });

  it('passes the configured binary path, cwd and timeout to exec', async () => {
    const { logger } = capturedLogger();
    const fake = cli({ '/opt/sb --version --json': fixture('version-json.stdout.txt') });
    await createShorebirdService(fake.exec, logger).version(
      { shorebirdPath: '/opt/sb', timeoutMs: 42 },
      CWD,
    );
    expect(fake.calls[0]?.cwd).toBe(CWD);
    expect(fake.calls[0]?.timeoutMs).toBe(42);
  });
});

describe('shorebirdService cancellation', () => {
  it('forwards the token to exec and reports cancelled when it fires', async () => {
    const { logger } = capturedLogger();
    const source = createCancellationSource();
    const { exec, calls } = fakeExec((request) =>
      request.token?.isCancellationRequested === true
        ? { ok: false, reason: { kind: 'cancelled' } }
        : undefined,
    );
    source.cancel();
    const result = await createShorebirdService(exec, logger).version(
      { ...options, token: source.token },
      CWD,
    );
    expect(calls[0]?.token).toBe(source.token);
    expect(result).toEqual({ ok: false, reason: { kind: 'cancelled' } });
  });
});

describe('shorebirdService.listReleases', () => {
  it('parses releases from the real capture', async () => {
    const { logger } = capturedLogger();
    const { exec } = cli({
      'shorebird releases list --json': fixture('releases-list-json.stdout.txt'),
    });
    const result = await createShorebirdService(exec, logger).listReleases(options, CWD);
    expect(result).toEqual({
      ok: true,
      value: [
        {
          version: '1.0.0-dev+12',
          appId: '16bfb68d-f517-42de-99ab-7c7ccee57f86',
          flutterRevision: 'c2515c46c7fca511e39735a615f0f12f3dca6230',
          flutterVersion: '3.44.9',
          createdAt: '2026-08-12T10:43:22.854871Z',
        },
      ],
    });
  });

  it('passes --flavor when given', async () => {
    const { logger } = capturedLogger();
    const fake = cli({
      'shorebird releases list --json --flavor prod': fixture('releases-list-json.stdout.txt'),
    });
    const result = await createShorebirdService(fake.exec, logger).listReleases(
      options,
      CWD,
      'prod',
    );
    expect(result.ok).toBe(true);
  });

  it('reports an error envelope as cli-error', async () => {
    const { logger } = capturedLogger();
    const { exec } = fakeExec(() => ({
      ok: false,
      reason: { kind: 'exit', exitCode: 70, stdout: '', stderr: 'Not logged in' },
    }));
    const result = await createShorebirdService(exec, logger).listReleases(options, CWD);
    expect(result).toEqual({
      ok: false,
      reason: { kind: 'cli-error', exitCode: 70, stderr: 'Not logged in' },
    });
  });

  it('reports a changed releases shape as unexpected output', async () => {
    const { logger } = capturedLogger();
    const { exec } = cli({
      'shorebird releases list --json':
        '{"status":"success","data":{"releases":[{"id":1}]},"meta":{"version":"1.6.116","command":"releases list"}}',
    });
    const result = await createShorebirdService(exec, logger).listReleases(options, CWD);
    expect(result.ok).toBe(false);
  });

  it('reports a non-success status as cli-error', async () => {
    const { logger } = capturedLogger();
    const { exec } = cli({
      'shorebird releases list --json':
        '{"status":"failure","error":"boom","meta":{"version":"1.6.116","command":"releases list"}}',
    });
    const result = await createShorebirdService(exec, logger).listReleases(options, CWD);
    expect(result).toEqual({
      ok: false,
      reason: { kind: 'cli-error', exitCode: 0, stderr: 'boom' },
    });
  });
});
