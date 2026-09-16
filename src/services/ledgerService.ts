import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Logger } from '../util/logger';
import { fail, ok, type Result } from '../util/result';
import { isRecord, stringField } from './cliJson';

export const LEDGER_SCHEMA_VERSION = 1;

export interface LedgerEntry {
  readonly xcodeVersion: string;
  readonly xcodeBuild: string;
  readonly flutterRevision: string;
  readonly shorebirdVersion: string;
  readonly macosVersion: string;
  readonly capturedAt: string;
  readonly capturedBy: string;
}

export interface LedgerApp {
  readonly releases: Readonly<Record<string, LedgerEntry>>;
}

export interface Ledger {
  readonly schemaVersion: typeof LEDGER_SCHEMA_VERSION;
  readonly apps: Readonly<Record<string, LedgerApp>>;
}

export type LedgerFailure =
  | { readonly kind: 'corrupt'; readonly path: string }
  | { readonly kind: 'unsupported-schema'; readonly schemaVersion: number }
  | { readonly kind: 'io'; readonly path: string; readonly message: string };

export interface LedgerService {
  readonly read: (path: string) => Promise<Result<Ledger, LedgerFailure>>;
  readonly record: (
    path: string,
    appId: string,
    release: string,
    entry: LedgerEntry,
  ) => Promise<Result<Ledger, LedgerFailure>>;
  readonly lookup: (ledger: Ledger, appId: string, release: string) => LedgerEntry | undefined;
}

const EMPTY_LEDGER: Ledger = { schemaVersion: LEDGER_SCHEMA_VERSION, apps: {} };
const ENTRY_FIELDS = [
  'xcodeVersion',
  'xcodeBuild',
  'flutterRevision',
  'shorebirdVersion',
  'macosVersion',
  'capturedAt',
  'capturedBy',
] as const;

function parseEntry(value: unknown): LedgerEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const fields = ENTRY_FIELDS.map((field) => [field, stringField(value, field)] as const);
  if (fields.some(([, v]) => v === undefined)) {
    return undefined;
  }
  return Object.fromEntries(fields) as unknown as LedgerEntry;
}

function parseApps(
  apps: Record<string, unknown>,
  log: Logger,
): Readonly<Record<string, LedgerApp>> | undefined {
  const parsed = Object.entries(apps).map(([appId, app]) => {
    if (!isRecord(app) || !isRecord(app['releases'])) {
      return undefined;
    }
    const releases = Object.entries(app['releases']).flatMap(([release, raw]) => {
      const entry = parseEntry(raw);
      if (entry === undefined) {
        log.warn(`ignoring malformed ledger entry ${appId}/${release}`);
        return [];
      }
      return [[release, entry] as const];
    });
    return [appId, { releases: Object.fromEntries(releases) }] as const;
  });
  return parsed.every((app) => app !== undefined) ? Object.fromEntries(parsed) : undefined;
}

function parseLedger(text: string, path: string, log: Logger): Result<Ledger, LedgerFailure> {
  const raw = safeParse(text);
  if (!isRecord(raw) || typeof raw['schemaVersion'] !== 'number' || !isRecord(raw['apps'])) {
    log.error(`ledger at ${path} is corrupt`);
    return fail({ kind: 'corrupt', path });
  }
  if (raw['schemaVersion'] !== LEDGER_SCHEMA_VERSION) {
    log.error(
      `ledger at ${path} has schemaVersion ${raw['schemaVersion']}; this extension supports ${LEDGER_SCHEMA_VERSION}`,
    );
    return fail({ kind: 'unsupported-schema', schemaVersion: raw['schemaVersion'] });
  }
  const apps = parseApps(raw['apps'], log);
  if (apps === undefined) {
    log.error(`ledger at ${path} is corrupt`);
    return fail({ kind: 'corrupt', path });
  }
  return ok({ schemaVersion: LEDGER_SCHEMA_VERSION, apps });
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function sortedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedDeep);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedDeep(value[key])]),
  );
}

export function serializeLedger(ledger: Ledger): string {
  return `${JSON.stringify(sortedDeep(ledger), null, 2)}\n`;
}

function withEntry(ledger: Ledger, appId: string, release: string, entry: LedgerEntry): Ledger {
  const app = ledger.apps[appId] ?? { releases: {} };
  return {
    schemaVersion: ledger.schemaVersion,
    apps: { ...ledger.apps, [appId]: { releases: { ...app.releases, [release]: entry } } },
  };
}

async function writeAtomically(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temp, text, 'utf8');
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export function createLedgerService(logger: Logger): LedgerService {
  const log = logger.child('ledger');

  const read: LedgerService['read'] = async (path) => {
    const text = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error);
    if (typeof text === 'string') {
      return parseLedger(text, path, log);
    }
    if (text.code === 'ENOENT') {
      return ok(EMPTY_LEDGER);
    }
    log.error(`cannot read ledger at ${path}: ${text.message}`);
    return fail({ kind: 'io', path, message: text.message });
  };

  return {
    read,
    record: async (path, appId, release, entry) => {
      const current = await read(path);
      if (!current.ok) {
        return current;
      }
      const next = withEntry(current.value, appId, release, entry);
      try {
        await writeAtomically(path, serializeLedger(next));
        log.info(`recorded ${appId}/${release}: Xcode ${entry.xcodeVersion} (${entry.xcodeBuild})`);
        return ok(next);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`cannot write ledger at ${path}: ${message}`);
        return fail({ kind: 'io', path, message });
      }
    },
    lookup: (ledger, appId, release) => ledger.apps[appId]?.releases[release],
  };
}
