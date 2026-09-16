export interface ToolchainFingerprint {
  readonly xcodeVersion: string;
  readonly xcodeBuild: string;
  readonly xcodeDeveloperDir: string;
  readonly flutterRevision: string;
  readonly shorebirdVersion: string;
  readonly macosVersion: string;
  readonly capturedAt: string;
}

export type DriftSeverity = 'ok' | 'patch-drift' | 'minor-drift' | 'major-drift' | 'unknown';

export interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface XcodebuildVersion {
  readonly version: string;
  readonly build: string;
}

export interface ComparisonResult {
  readonly severity: DriftSeverity;
  readonly flutterRevisionMatches: boolean;
}

const VERSION_PATTERN = /^(\d+)\.(\d+)(?:\.(\d+))?(?:\s|$)/;
const XCODE_LINE = /^Xcode\s+(\S+)\s*$/m;
const BUILD_LINE = /^Build version\s+(\S+)\s*$/m;

export function parseXcodeVersion(raw: string): ParsedVersion | undefined {
  const match = VERSION_PATTERN.exec(raw.trim());
  if (!match) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
  };
}

export function parseXcodebuildVersion(stdout: string): XcodebuildVersion | undefined {
  const version = XCODE_LINE.exec(stdout)?.[1];
  const build = BUILD_LINE.exec(stdout)?.[1];
  if (version === undefined || build === undefined) {
    return undefined;
  }
  return { version, build };
}

function severityOf(current: ToolchainFingerprint, recorded: ToolchainFingerprint): DriftSeverity {
  if (current.xcodeBuild !== '' && current.xcodeBuild === recorded.xcodeBuild) {
    return 'ok';
  }
  const a = parseXcodeVersion(current.xcodeVersion);
  const b = parseXcodeVersion(recorded.xcodeVersion);
  if (a === undefined || b === undefined) {
    return 'unknown';
  }
  if (a.major !== b.major) {
    return 'major-drift';
  }
  if (a.minor !== b.minor) {
    return 'minor-drift';
  }
  return 'patch-drift';
}

export function compare(
  current: ToolchainFingerprint,
  recorded: ToolchainFingerprint | undefined,
): ComparisonResult {
  if (recorded === undefined) {
    return { severity: 'unknown', flutterRevisionMatches: true };
  }
  const bothKnown = current.flutterRevision !== '' && recorded.flutterRevision !== '';
  return {
    severity: severityOf(current, recorded),
    flutterRevisionMatches: !bothKnown || current.flutterRevision === recorded.flutterRevision,
  };
}
