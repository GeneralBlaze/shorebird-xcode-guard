import { describe, expect, it } from 'vitest';
import {
  compare,
  parseXcodeVersion,
  parseXcodebuildVersion,
  type ToolchainFingerprint,
} from '../../src/domain/fingerprint';

const base: ToolchainFingerprint = {
  xcodeVersion: '16.2',
  xcodeBuild: '16C5032a',
  xcodeDeveloperDir: '/Applications/Xcode.app/Contents/Developer',
  flutterRevision: 'abc123',
  shorebirdVersion: '1.6.116',
  macosVersion: '15.3',
  capturedAt: '2026-09-14T10:22:41Z',
};

const withXcode = (xcodeVersion: string, xcodeBuild: string): ToolchainFingerprint => ({
  ...base,
  xcodeVersion,
  xcodeBuild,
});

describe('parseXcodeVersion', () => {
  it('parses major.minor', () => {
    expect(parseXcodeVersion('16.2')).toEqual({ major: 16, minor: 2, patch: 0 });
  });
  it('parses major.minor.patch', () => {
    expect(parseXcodeVersion('16.2.1')).toEqual({ major: 16, minor: 2, patch: 1 });
  });
  it('parses beta suffix', () => {
    expect(parseXcodeVersion('16.0 beta 3')).toEqual({ major: 16, minor: 0, patch: 0 });
  });
  it('rejects malformed', () => {
    expect(parseXcodeVersion('sixteen')).toBeUndefined();
  });
  it('rejects empty', () => {
    expect(parseXcodeVersion('')).toBeUndefined();
  });
  it('rejects major-only', () => {
    expect(parseXcodeVersion('16')).toBeUndefined();
  });
});

describe('parseXcodebuildVersion', () => {
  it('parses the real capture', () => {
    expect(parseXcodebuildVersion('Xcode 26.3\nBuild version 17C529\n')).toEqual({
      version: '26.3',
      build: '17C529',
    });
  });
  it('parses a three-part version', () => {
    expect(parseXcodebuildVersion('Xcode 15.4.1\nBuild version 15F31d')).toEqual({
      version: '15.4.1',
      build: '15F31d',
    });
  });
  it('parses CRLF and trailing whitespace', () => {
    expect(parseXcodebuildVersion('Xcode 16.2\r\nBuild version 16C5032a\r\n')).toEqual({
      version: '16.2',
      build: '16C5032a',
    });
  });
  it('returns undefined when build line is missing', () => {
    expect(parseXcodebuildVersion('Xcode 16.2')).toBeUndefined();
  });
  it('returns undefined for CommandLineTools error output', () => {
    expect(
      parseXcodebuildVersion(
        "xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance",
      ),
    ).toBeUndefined();
  });
});

describe('compare', () => {
  it('is ok when builds are identical', () => {
    expect(compare(base, base).severity).toBe('ok');
  });
  it('is patch-drift on same major.minor with different build', () => {
    expect(compare(withXcode('16.2', '16C5033b'), base).severity).toBe('patch-drift');
  });
  it('is patch-drift on same major.minor different patch', () => {
    expect(compare(withXcode('16.2.1', '16C5040a'), base).severity).toBe('patch-drift');
  });
  it('is minor-drift on same major different minor', () => {
    expect(compare(withXcode('16.1', '16B40'), base).severity).toBe('minor-drift');
  });
  it('is major-drift on different major', () => {
    expect(compare(withXcode('15.4', '15F31d'), base).severity).toBe('major-drift');
  });
  it('is major-drift even when minor matches', () => {
    expect(compare(withXcode('15.2', '15C500b'), base).severity).toBe('major-drift');
  });
  it('is unknown when recorded is undefined', () => {
    expect(compare(base, undefined).severity).toBe('unknown');
  });
  it('is unknown when current version is unparseable and builds differ', () => {
    expect(compare(withXcode('', ''), base).severity).toBe('unknown');
  });
  it('is unknown when recorded version is unparseable and builds differ', () => {
    expect(compare(base, withXcode('garbage', '16C5032a-x')).severity).toBe('unknown');
  });
  it('is ok when builds match even if versions are unparseable', () => {
    expect(compare(withXcode('x', '16C5032a'), withXcode('y', '16C5032a')).severity).toBe('ok');
  });
  it('reports flutter revision mismatch separately', () => {
    const result = compare({ ...base, flutterRevision: 'other' }, base);
    expect(result.severity).toBe('ok');
    expect(result.flutterRevisionMatches).toBe(false);
  });
  it('reports flutter revision match', () => {
    expect(compare(base, base).flutterRevisionMatches).toBe(true);
  });
  it('treats missing flutter revision on either side as a match', () => {
    expect(compare({ ...base, flutterRevision: '' }, base).flutterRevisionMatches).toBe(true);
  });
  it('returns unknown flutter match when recorded is undefined', () => {
    expect(compare(base, undefined).flutterRevisionMatches).toBe(true);
  });
});
