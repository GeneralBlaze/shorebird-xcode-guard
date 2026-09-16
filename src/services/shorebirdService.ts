import type { Exec, ExecFailure } from '../util/exec';
import type { Logger } from '../util/logger';
import { fail, ok, type Result } from '../util/result';
import { cliVersionOf, isRecord, parseEnvelope, stringField, type CliEnvelope } from './cliJson';

export interface ShorebirdOptions {
  readonly shorebirdPath: string;
  readonly timeoutMs: number;
}

export interface ShorebirdVersionInfo {
  readonly shorebirdVersion: string;
  readonly flutterVersion: string;
  readonly flutterRevision: string;
}

export interface ShorebirdRelease {
  readonly version: string;
  readonly appId: string;
  readonly flutterRevision: string;
  readonly flutterVersion: string;
  readonly createdAt: string;
}

export type ShorebirdFailure =
  | { readonly kind: 'cli-missing'; readonly command: string }
  | { readonly kind: 'timeout'; readonly timeoutMs: number }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'cli-error'; readonly exitCode: number; readonly stderr: string }
  | { readonly kind: 'unexpected-output'; readonly cliVersion: string };

export interface ShorebirdService {
  readonly version: (
    options: ShorebirdOptions,
    cwd: string,
  ) => Promise<Result<ShorebirdVersionInfo, ShorebirdFailure>>;
  readonly listReleases: (
    options: ShorebirdOptions,
    cwd: string,
    flavor?: string,
  ) => Promise<Result<readonly ShorebirdRelease[], ShorebirdFailure>>;
}

function mapExecFailure(failure: ExecFailure, log: Logger): ShorebirdFailure {
  switch (failure.kind) {
    case 'not-found':
      log.warn(`shorebird not found at "${failure.command}"`);
      return { kind: 'cli-missing', command: failure.command };
    case 'timeout':
      log.warn(`shorebird timed out after ${failure.timeoutMs}ms`);
      return { kind: 'timeout', timeoutMs: failure.timeoutMs };
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'exit':
      log.warn(`shorebird exited ${failure.exitCode}: ${failure.stderr.trim()}`);
      return { kind: 'cli-error', exitCode: failure.exitCode, stderr: failure.stderr.trim() };
    case 'spawn-error':
      log.error(`shorebird spawn error: ${failure.message}`);
      return { kind: 'cli-error', exitCode: -1, stderr: failure.message };
  }
}

function parseRelease(value: unknown): ShorebirdRelease | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const version = stringField(value, 'version');
  const appId = stringField(value, 'app_id');
  const flutterRevision = stringField(value, 'flutter_revision');
  if (version === undefined || appId === undefined || flutterRevision === undefined) {
    return undefined;
  }
  return {
    version,
    appId,
    flutterRevision,
    flutterVersion: stringField(value, 'flutter_version') ?? '',
    createdAt: stringField(value, 'created_at') ?? '',
  };
}

function parseVersionInfo(data: unknown): ShorebirdVersionInfo | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const shorebirdVersion = stringField(data, 'shorebird_version');
  const flutterRevision = stringField(data, 'flutter_revision');
  if (shorebirdVersion === undefined || flutterRevision === undefined) {
    return undefined;
  }
  return {
    shorebirdVersion,
    flutterRevision,
    flutterVersion: stringField(data, 'flutter_version') ?? '',
  };
}

function parseReleases(data: unknown): readonly ShorebirdRelease[] | undefined {
  if (!isRecord(data) || !Array.isArray(data['releases'])) {
    return undefined;
  }
  const releases = data['releases'].map(parseRelease);
  return releases.every((release): release is ShorebirdRelease => release !== undefined)
    ? releases
    : undefined;
}

export function createShorebirdService(exec: Exec, logger: Logger): ShorebirdService {
  const log = logger.child('shorebird');

  const run = async (
    options: ShorebirdOptions,
    cwd: string,
    args: readonly string[],
  ): Promise<Result<CliEnvelope, ShorebirdFailure>> => {
    const result = await exec({
      command: options.shorebirdPath,
      args,
      cwd,
      timeoutMs: options.timeoutMs,
    });
    if (!result.ok) {
      return fail(mapExecFailure(result.reason, log));
    }
    const envelope = parseEnvelope(result.value.stdout);
    if (envelope.ok) {
      log.debug(`shorebird ${args.join(' ')} ok (cli ${cliVersionOf(envelope.value)})`);
      return envelope;
    }
    if (envelope.reason.kind === 'status-failure') {
      log.warn(`shorebird ${args.join(' ')} failed: ${envelope.reason.message}`);
      return fail({ kind: 'cli-error', exitCode: 0, stderr: envelope.reason.message });
    }
    log.warn(
      `shorebird ${args.join(' ')} returned ${envelope.reason.kind}; expected a --json envelope`,
    );
    return fail({ kind: 'unexpected-output', cliVersion: 'unknown' });
  };

  const unexpected = <T>(envelope: CliEnvelope, what: string): Result<T, ShorebirdFailure> => {
    const cliVersion = cliVersionOf(envelope);
    log.warn(`${what} shape not recognised (cli ${cliVersion}); treating as unknown`);
    return fail({ kind: 'unexpected-output', cliVersion });
  };

  return {
    version: async (options, cwd) => {
      const envelope = await run(options, cwd, ['--version', '--json']);
      if (!envelope.ok) {
        return envelope;
      }
      const info = parseVersionInfo(envelope.value.data);
      return info === undefined ? unexpected(envelope.value, 'version') : ok(info);
    },
    listReleases: async (options, cwd, flavor) => {
      const args =
        flavor === undefined
          ? ['releases', 'list', '--json']
          : ['releases', 'list', '--json', '--flavor', flavor];
      const envelope = await run(options, cwd, args);
      if (!envelope.ok) {
        return envelope;
      }
      const releases = parseReleases(envelope.value.data);
      return releases === undefined ? unexpected(envelope.value, 'releases list') : ok(releases);
    },
  };
}
