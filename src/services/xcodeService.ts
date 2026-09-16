import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseXcodebuildVersion } from '../domain/fingerprint';
import type { Exec, ExecFailure } from '../util/exec';
import type { Logger } from '../util/logger';
import { fail, ok, type Result } from '../util/result';

const APPLICATIONS = '/Applications';
const XCODE_APP = /^Xcode.*\.app$/;
const COMMAND_LINE_TOOLS = /CommandLineTools/;
const PLIST_STRING = (key: string) => new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`);

export interface ActiveXcode {
  readonly xcodeVersion: string;
  readonly xcodeBuild: string;
  readonly xcodeDeveloperDir: string;
  readonly macosVersion: string;
}

export interface InstalledXcode {
  readonly path: string;
  readonly developerDir: string;
  readonly version: string;
  readonly build: string;
}

export type XcodeFailure =
  | { readonly kind: 'no-xcode' }
  | { readonly kind: 'command-line-tools-only'; readonly developerDir: string }
  | { readonly kind: 'timeout'; readonly timeoutMs: number }
  | { readonly kind: 'unexpected-output'; readonly stdout: string };

export interface XcodeFileSystem {
  readonly listApplications: () => Promise<readonly string[]>;
  readonly readFile: (path: string) => Promise<string>;
}

export interface XcodeService {
  readonly active: (timeoutMs: number) => Promise<Result<ActiveXcode, XcodeFailure>>;
  readonly installed: () => Promise<readonly InstalledXcode[]>;
}

export const nodeXcodeFileSystem: XcodeFileSystem = {
  listApplications: () => readdir(APPLICATIONS),
  readFile: (path) => readFile(path, 'utf8'),
};

function plistValue(plist: string, key: string): string | undefined {
  return PLIST_STRING(key).exec(plist)?.[1]?.trim();
}

function toInstalled(name: string, plist: string): InstalledXcode | undefined {
  const version = plistValue(plist, 'CFBundleShortVersionString');
  const build = plistValue(plist, 'ProductBuildVersion');
  if (version === undefined || build === undefined) {
    return undefined;
  }
  const path = join(APPLICATIONS, name);
  return { path, developerDir: join(path, 'Contents', 'Developer'), version, build };
}

function byPath(a: InstalledXcode, b: InstalledXcode): number {
  return a.path.localeCompare(b.path);
}

function xcodebuildFailure(failure: ExecFailure, developerDir: string): XcodeFailure {
  if (failure.kind === 'timeout') {
    return { kind: 'timeout', timeoutMs: failure.timeoutMs };
  }
  if (
    COMMAND_LINE_TOOLS.test(developerDir) ||
    (failure.kind === 'exit' && COMMAND_LINE_TOOLS.test(failure.stderr))
  ) {
    return { kind: 'command-line-tools-only', developerDir };
  }
  return { kind: 'no-xcode' };
}

export function createXcodeService(exec: Exec, fs: XcodeFileSystem, logger: Logger): XcodeService {
  const log = logger.child('xcode');

  const firstLine = async (
    command: string,
    args: readonly string[],
    timeoutMs: number,
  ): Promise<string> => {
    const result = await exec({ command, args, timeoutMs });
    return result.ok ? result.value.stdout.trim() : '';
  };

  const readInstalled = async (name: string): Promise<InstalledXcode | undefined> => {
    try {
      const plist = await fs.readFile(join(APPLICATIONS, name, 'Contents', 'version.plist'));
      const installed = toInstalled(name, plist);
      if (installed === undefined) {
        log.warn(
          `${name}: version.plist missing CFBundleShortVersionString or ProductBuildVersion`,
        );
      }
      return installed;
    } catch (error) {
      log.warn(`${name}: cannot read version.plist (${String(error)})`);
      return undefined;
    }
  };

  return {
    active: async (timeoutMs) => {
      const developerDir = await firstLine('xcode-select', ['-p'], timeoutMs);
      const macosVersion = await firstLine('sw_vers', ['-productVersion'], timeoutMs);
      const build = await exec({ command: 'xcodebuild', args: ['-version'], timeoutMs });
      if (!build.ok) {
        const failure = xcodebuildFailure(build.reason, developerDir);
        log.warn(`xcodebuild -version failed: ${failure.kind}`);
        return fail(failure);
      }
      const parsed = parseXcodebuildVersion(build.value.stdout);
      if (parsed === undefined) {
        log.warn(`xcodebuild -version output not recognised: ${build.value.stdout.trim()}`);
        return fail({ kind: 'unexpected-output', stdout: build.value.stdout });
      }
      return ok({
        xcodeVersion: parsed.version,
        xcodeBuild: parsed.build,
        xcodeDeveloperDir: developerDir,
        macosVersion,
      });
    },
    installed: async () => {
      const names = await fs.listApplications().catch((error: unknown) => {
        log.warn(`cannot list ${APPLICATIONS}: ${String(error)}`);
        return [] as readonly string[];
      });
      const candidates = await Promise.all(
        names.filter((name) => XCODE_APP.test(name)).map(readInstalled),
      );
      return candidates.filter((x): x is InstalledXcode => x !== undefined).sort(byPath);
    },
  };
}
