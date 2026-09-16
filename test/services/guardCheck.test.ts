import { describe, expect, it } from 'vitest';
import { runGuardCheck, type GuardInputs } from '../../src/services/guardCheck';
import type { Ledger, LedgerEntry } from '../../src/services/ledgerService';
import type { ShorebirdRelease } from '../../src/services/shorebirdService';
import { capturedLogger } from './fakes';

const entry: LedgerEntry = {
  xcodeVersion: '16.2',
  xcodeBuild: '16C5032a',
  flutterRevision: 'rev1',
  shorebirdVersion: '1.6.116',
  macosVersion: '15.3',
  capturedAt: '2026-09-14T10:22:41Z',
  capturedBy: 'x',
};

const release = (version: string, flutterRevision = 'rev1'): ShorebirdRelease => ({
  version,
  appId: 'app',
  flutterRevision,
  flutterVersion: '3.44.9',
  createdAt: '2026-08-12T10:43:22Z',
});

const ledgerWith = (releases: Readonly<Record<string, LedgerEntry>>): Ledger => ({
  schemaVersion: 1,
  apps: { app: { releases } },
});

const inputs = (overrides: Partial<GuardInputs>): GuardInputs => ({
  appId: 'app',
  active: {
    ok: true,
    value: {
      xcodeVersion: '16.2',
      xcodeBuild: '16C5032a',
      xcodeDeveloperDir: '/x',
      macosVersion: '15.3',
    },
  },
  version: {
    ok: true,
    value: { shorebirdVersion: '1.6.116', flutterVersion: '3.44.9', flutterRevision: 'rev1' },
  },
  releases: { ok: true, value: [release('1.0.0+1'), release('1.0.0+2')] },
  ledger: { ok: true, value: ledgerWith({ '1.0.0+2': entry }) },
  policy: { blockOn: 'minor-drift', warnOn: 'patch-drift' },
  checkFlutterRevision: true,
  targetRelease: undefined,
  ...overrides,
});

describe('runGuardCheck', () => {
  it('targets the newest release and reports ok when aligned', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(inputs({}), logger);
    expect(result.state).toBe('checked');
    if (result.state === 'checked') {
      expect(result.targetRelease).toBe('1.0.0+2');
      expect(result.severity).toBe('ok');
      expect(result.action).toBe('allow');
      expect(result.recorded).toEqual(entry);
    }
  });

  it('honours an explicit target release', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(inputs({ targetRelease: '1.0.0+1' }), logger);
    expect(result.state === 'checked' && result.targetRelease).toBe('1.0.0+1');
    expect(result.state === 'checked' && result.severity).toBe('unknown');
  });

  it('blocks on minor drift with default policy', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(
      inputs({
        active: {
          ok: true,
          value: {
            xcodeVersion: '16.1',
            xcodeBuild: '16B40',
            xcodeDeveloperDir: '/x',
            macosVersion: '15.3',
          },
        },
      }),
      logger,
    );
    expect(result.state === 'checked' && result.action).toBe('block');
    expect(result.state === 'checked' && result.severity).toBe('minor-drift');
  });

  it('escalates to block when the flutter revision differs from the server release', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(
      inputs({ releases: { ok: true, value: [release('1.0.0+2', 'rev-other')] } }),
      logger,
    );
    expect(result.state === 'checked' && result.flutterRevisionMatches).toBe(false);
    expect(result.state === 'checked' && result.action).toBe('block');
  });

  it('ignores flutter revision when the setting is off', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(
      inputs({
        releases: { ok: true, value: [release('1.0.0+2', 'rev-other')] },
        checkFlutterRevision: false,
      }),
      logger,
    );
    expect(result.state === 'checked' && result.flutterRevisionMatches).toBe(true);
    expect(result.state === 'checked' && result.action).toBe('allow');
  });

  it('reports no-xcode when the active Xcode cannot be read', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(
      inputs({ active: { ok: false, reason: { kind: 'no-xcode' } } }),
      logger,
    );
    expect(result).toEqual({ state: 'no-xcode', reason: { kind: 'no-xcode' } });
  });

  it('reports cli-unavailable when shorebird is missing but still carries the active Xcode', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(
      inputs({
        version: { ok: false, reason: { kind: 'cli-missing', command: 'shorebird' } },
        releases: { ok: false, reason: { kind: 'cli-missing', command: 'shorebird' } },
      }),
      logger,
    );
    expect(result.state).toBe('cli-unavailable');
    if (result.state === 'cli-unavailable') {
      expect(result.active.xcodeVersion).toBe('16.2');
      expect(result.reason.kind).toBe('cli-missing');
    }
  });

  it('falls back to the ledger releases when releases list fails', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(
      inputs({ releases: { ok: false, reason: { kind: 'timeout', timeoutMs: 1 } } }),
      logger,
    );
    expect(result.state === 'checked' && result.targetRelease).toBe('1.0.0+2');
    expect(result.state === 'checked' && result.severity).toBe('ok');
  });

  it('reports no-releases when neither server nor ledger know any', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(
      inputs({ releases: { ok: true, value: [] }, ledger: { ok: true, value: ledgerWith({}) } }),
      logger,
    );
    expect(result.state).toBe('no-releases');
  });

  it('reports ledger-error when the ledger is corrupt', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(
      inputs({ ledger: { ok: false, reason: { kind: 'corrupt', path: '/l' } } }),
      logger,
    );
    expect(result).toEqual({ state: 'ledger-error', reason: { kind: 'corrupt', path: '/l' } });
  });

  it('builds the current fingerprint from active xcode and cli version', () => {
    const { logger } = capturedLogger();
    const result = runGuardCheck(inputs({}), logger);
    expect(result.state === 'checked' && result.current.flutterRevision).toBe('rev1');
    expect(result.state === 'checked' && result.current.shorebirdVersion).toBe('1.6.116');
    expect(result.state === 'checked' && result.current.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
