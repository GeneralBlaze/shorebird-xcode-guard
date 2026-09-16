import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { readConfig, type GuardConfig } from './config';
import { runGuardCheck, type GuardOutcome } from './services/guardCheck';
import type { LedgerEntry, LedgerService } from './services/ledgerService';
import type { ShorebirdRelease, ShorebirdService } from './services/shorebirdService';
import {
  parseShorebirdYaml,
  resolveAppForPath,
  type ShorebirdApp,
} from './services/workspaceService';
import type { XcodeService } from './services/xcodeService';
import type { Logger } from './util/logger';
import type { Result } from './util/result';

export interface GuardServices {
  readonly xcode: XcodeService;
  readonly shorebird: ShorebirdService;
  readonly ledger: LedgerService;
  readonly logger: Logger;
}

export interface CheckRequest {
  readonly app: ShorebirdApp;
  readonly flavor?: string;
  readonly targetRelease?: string;
}

export interface GuardController {
  readonly apps: () => readonly ShorebirdApp[];
  readonly refreshApps: () => Promise<readonly ShorebirdApp[]>;
  readonly activeApp: () => ShorebirdApp | undefined;
  readonly configFor: (app: ShorebirdApp) => GuardConfig;
  readonly ledgerPathFor: (app: ShorebirdApp) => string;
  readonly appIdFor: (app: ShorebirdApp, flavor: string | undefined) => string;
  readonly check: (request: CheckRequest) => Promise<GuardOutcome>;
  readonly knownReleases: (request: CheckRequest) => Promise<readonly string[]>;
  readonly record: (request: CheckRequest, release: string) => Promise<Result<LedgerEntry, string>>;
  readonly isOverridden: (key: string) => boolean;
  readonly override: (key: string) => void;
  readonly isDismissed: (key: string) => boolean;
  readonly dismiss: (key: string) => void;
}

const EXCLUDE = '**/{node_modules,build,.dart_tool,.symlinks,Pods}/**';

export const overrideKey = (outcome: GuardOutcome, appId: string): string =>
  outcome.state === 'checked'
    ? `${appId}/${outcome.targetRelease}/${outcome.current.xcodeBuild}`
    : '';

async function loadApps(logger: Logger): Promise<readonly ShorebirdApp[]> {
  const files = await vscode.workspace.findFiles('**/shorebird.yaml', EXCLUDE);
  const parsed = await Promise.all(
    files.map(async (uri) => {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const app = parseShorebirdYaml(uri.fsPath, Buffer.from(bytes).toString('utf8'));
      if (app === undefined) {
        logger.warn(`${uri.fsPath}: no app_id found`);
      }
      return app;
    }),
  );
  return parsed
    .filter((app): app is ShorebirdApp => app !== undefined)
    .sort((a, b) => a.root.localeCompare(b.root));
}

export function createGuardController(services: GuardServices): GuardController {
  const state = {
    apps: [] as readonly ShorebirdApp[],
    overrides: new Set<string>(),
    dismissed: new Set<string>(),
  };
  const log = services.logger.child('controller');

  const configFor = (app: ShorebirdApp): GuardConfig => readConfig(vscode.Uri.file(app.root));
  const ledgerPathFor = (app: ShorebirdApp): string =>
    path.resolve(app.root, configFor(app).ledgerPath);
  const appIdFor = (app: ShorebirdApp, flavor: string | undefined): string =>
    flavor === undefined ? app.appId : (app.flavors[flavor] ?? app.appId);

  const check = async (request: CheckRequest): Promise<GuardOutcome> => {
    const config = configFor(request.app);
    const cli = { shorebirdPath: config.shorebirdPath, timeoutMs: config.cliTimeoutMs };
    const [active, version, releases, ledger] = await Promise.all([
      services.xcode.active(config.cliTimeoutMs),
      services.shorebird.version(cli, request.app.root),
      services.shorebird.listReleases(cli, request.app.root, request.flavor),
      services.ledger.read(ledgerPathFor(request.app)),
    ]);
    return runGuardCheck(
      {
        appId: appIdFor(request.app, request.flavor),
        active,
        version,
        releases,
        ledger,
        policy: config.policy,
        checkFlutterRevision: config.checkFlutterRevision,
        targetRelease: request.targetRelease,
      },
      services.logger,
    );
  };

  const knownReleases = async (request: CheckRequest): Promise<readonly string[]> => {
    const config = configFor(request.app);
    const cli = { shorebirdPath: config.shorebirdPath, timeoutMs: config.cliTimeoutMs };
    const [releases, ledger] = await Promise.all([
      services.shorebird.listReleases(cli, request.app.root, request.flavor),
      services.ledger.read(ledgerPathFor(request.app)),
    ]);
    const fromServer = releases.ok ? releases.value.map((r: ShorebirdRelease) => r.version) : [];
    const appId = appIdFor(request.app, request.flavor);
    const fromLedger = ledger.ok ? Object.keys(ledger.value.apps[appId]?.releases ?? {}) : [];
    return [...new Set([...fromServer, ...fromLedger])].sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    );
  };

  const record = async (
    request: CheckRequest,
    release: string,
  ): Promise<Result<LedgerEntry, string>> => {
    const config = configFor(request.app);
    const cli = { shorebirdPath: config.shorebirdPath, timeoutMs: config.cliTimeoutMs };
    const [active, version] = await Promise.all([
      services.xcode.active(config.cliTimeoutMs),
      services.shorebird.version(cli, request.app.root),
    ]);
    if (!active.ok) {
      return { ok: false, reason: `Cannot read the active Xcode (${active.reason.kind}).` };
    }
    const entry: LedgerEntry = {
      xcodeVersion: active.value.xcodeVersion,
      xcodeBuild: active.value.xcodeBuild,
      flutterRevision: version.ok ? version.value.flutterRevision : '',
      shorebirdVersion: version.ok ? version.value.shorebirdVersion : '',
      macosVersion: active.value.macosVersion,
      capturedAt: new Date().toISOString(),
      capturedBy: `${os.userInfo().username}@${os.hostname()}`,
    };
    const written = await services.ledger.record(
      ledgerPathFor(request.app),
      appIdFor(request.app, request.flavor),
      release,
      entry,
    );
    return written.ok
      ? { ok: true, value: entry }
      : { ok: false, reason: `Ledger ${written.reason.kind}: cannot write.` };
  };

  return {
    apps: () => state.apps,
    refreshApps: async () => {
      state.apps = await loadApps(log);
      log.info(`found ${state.apps.length} shorebird.yaml`);
      return state.apps;
    },
    activeApp: () =>
      resolveAppForPath(state.apps, vscode.window.activeTextEditor?.document.uri.fsPath),
    configFor,
    ledgerPathFor,
    appIdFor,
    check,
    knownReleases,
    record,
    isOverridden: (key) => state.overrides.has(key),
    override: (key) => void state.overrides.add(key),
    isDismissed: (key) => state.dismissed.has(key),
    dismiss: (key) => void state.dismissed.add(key),
  };
}
