import { mkdtemp, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLedgerService, type LedgerEntry } from '../../src/services/ledgerService';
import { capturedLogger } from './fakes';

const entry: LedgerEntry = {
  xcodeVersion: '16.2',
  xcodeBuild: '16C5032a',
  flutterRevision: 'b8f7f1f986',
  shorebirdVersion: '1.7.3',
  macosVersion: '15.3',
  capturedAt: '2026-09-14T10:22:41Z',
  capturedBy: 'benji@mbp',
};

const APP = 'a1b2c3d4';

const sortedEntry = Object.fromEntries(
  Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)),
);

describe('ledgerService', () => {
  const state = { dir: '' };
  beforeEach(async () => {
    state.dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  });
  afterEach(() => undefined);

  const ledgerPath = () => join(state.dir, '.shorebird-guard', 'ledger.json');

  it('returns an empty ledger when the file does not exist', async () => {
    const { logger } = capturedLogger();
    const result = await createLedgerService(logger).read(ledgerPath());
    expect(result).toEqual({ ok: true, value: { schemaVersion: 1, apps: {} } });
  });

  it('round-trips an entry through a real file', async () => {
    const { logger } = capturedLogger();
    const service = createLedgerService(logger);
    const written = await service.record(ledgerPath(), APP, '1.4.2+18', entry);
    expect(written.ok).toBe(true);
    const read = await service.read(ledgerPath());
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.apps[APP]?.releases['1.4.2+18']).toEqual(entry);
    }
  });

  it('writes the exact §5.2 shape with sorted keys and 2-space indent', async () => {
    const { logger } = capturedLogger();
    const service = createLedgerService(logger);
    await service.record(ledgerPath(), 'zeta', '2.0.0+1', entry);
    await service.record(ledgerPath(), 'alpha', '1.0.0+2', entry);
    await service.record(ledgerPath(), 'alpha', '1.0.0+1', entry);
    const text = await readFile(ledgerPath(), 'utf8');
    expect(text).toBe(
      JSON.stringify(
        {
          apps: {
            alpha: { releases: { '1.0.0+1': sortedEntry, '1.0.0+2': sortedEntry } },
            zeta: { releases: { '2.0.0+1': sortedEntry } },
          },
          schemaVersion: 1,
        },
        null,
        2,
      ) + '\n',
    );
    expect(text.indexOf('"capturedAt"')).toBeLessThan(text.indexOf('"capturedBy"'));
    expect(text.indexOf('"capturedBy"')).toBeLessThan(text.indexOf('"flutterRevision"'));
  });

  it('leaves no temp files behind after writing', async () => {
    const { logger } = capturedLogger();
    await createLedgerService(logger).record(ledgerPath(), APP, '1.0.0+1', entry);
    expect(await readdir(join(state.dir, '.shorebird-guard'))).toEqual(['ledger.json']);
  });

  it('recovers from corrupt JSON with a typed failure', async () => {
    const { logger, lines } = capturedLogger();
    await mkdir(join(state.dir, '.shorebird-guard'));
    await writeFile(ledgerPath(), '{ not json');
    const result = await createLedgerService(logger).read(ledgerPath());
    expect(result).toEqual({ ok: false, reason: { kind: 'corrupt', path: ledgerPath() } });
    expect(lines.some((line) => line.startsWith('error'))).toBe(true);
  });

  it('rejects an unsupported schema version', async () => {
    const { logger } = capturedLogger();
    await mkdir(join(state.dir, '.shorebird-guard'));
    await writeFile(ledgerPath(), JSON.stringify({ schemaVersion: 2, apps: {} }));
    const result = await createLedgerService(logger).read(ledgerPath());
    expect(result).toEqual({ ok: false, reason: { kind: 'unsupported-schema', schemaVersion: 2 } });
  });

  it('treats a structurally wrong document as corrupt', async () => {
    const { logger } = capturedLogger();
    await mkdir(join(state.dir, '.shorebird-guard'));
    await writeFile(ledgerPath(), JSON.stringify({ schemaVersion: 1, apps: [] }));
    const result = await createLedgerService(logger).read(ledgerPath());
    expect(result).toEqual({ ok: false, reason: { kind: 'corrupt', path: ledgerPath() } });
  });

  it('refuses to record over a corrupt ledger', async () => {
    const { logger } = capturedLogger();
    await mkdir(join(state.dir, '.shorebird-guard'));
    await writeFile(ledgerPath(), 'garbage');
    const result = await createLedgerService(logger).record(ledgerPath(), APP, '1.0.0+1', entry);
    expect(result).toEqual({ ok: false, reason: { kind: 'corrupt', path: ledgerPath() } });
    expect(await readFile(ledgerPath(), 'utf8')).toBe('garbage');
  });

  it('drops malformed entries but keeps valid ones', async () => {
    const { logger, lines } = capturedLogger();
    await mkdir(join(state.dir, '.shorebird-guard'));
    await writeFile(
      ledgerPath(),
      JSON.stringify({
        schemaVersion: 1,
        apps: { [APP]: { releases: { good: entry, bad: { xcodeVersion: 1 } } } },
      }),
    );
    const result = await createLedgerService(logger).read(ledgerPath());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value.apps[APP]?.releases ?? {})).toEqual(['good']);
    }
    expect(lines.some((line) => line.includes('bad'))).toBe(true);
  });

  it('finds the recorded entry for an app and release', async () => {
    const { logger } = capturedLogger();
    const service = createLedgerService(logger);
    await service.record(ledgerPath(), APP, '1.0.0+1', entry);
    const ledger = await service.read(ledgerPath());
    expect(ledger.ok && service.lookup(ledger.value, APP, '1.0.0+1')).toEqual(entry);
    expect(ledger.ok && service.lookup(ledger.value, APP, '9.9.9+9')).toBeUndefined();
    expect(ledger.ok && service.lookup(ledger.value, 'other', '1.0.0+1')).toBeUndefined();
  });

  it('reports write failures as io', async () => {
    const { logger } = capturedLogger();
    const result = await createLedgerService(logger).record(
      '/dev/null/impossible/ledger.json',
      APP,
      '1.0.0+1',
      entry,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.kind).toBe('io');
    }
  });
});
