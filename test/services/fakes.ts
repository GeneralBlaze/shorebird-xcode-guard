import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Exec, ExecRequest, ExecResult } from '../../src/util/exec';
import type { LogSink, Logger } from '../../src/util/logger';
import { createLogger } from '../../src/util/logger';

const FIXTURES = join(__dirname, '..', 'fixtures', 'cli');

export const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

export type Responder = (request: ExecRequest) => ExecResult | undefined;

export interface FakeExec {
  readonly exec: Exec;
  readonly calls: readonly ExecRequest[];
}

export function fakeExec(responder: Responder): FakeExec {
  const calls: ExecRequest[] = [];
  const exec: Exec = (request) => {
    calls.push(request);
    const response = responder(request);
    return Promise.resolve(
      response ?? { ok: false, reason: { kind: 'not-found', command: request.command } },
    );
  };
  return { exec, calls };
}

export const stdout = (text: string): ExecResult => ({
  ok: true,
  value: { stdout: text, stderr: '', exitCode: 0 },
});

export const key = (request: ExecRequest): string => [request.command, ...request.args].join(' ');

export interface CapturedLog {
  readonly logger: Logger;
  readonly lines: readonly string[];
}

export function capturedLogger(): CapturedLog {
  const lines: string[] = [];
  const push = (level: string) => (message: string) => {
    lines.push(`${level}: ${message}`);
  };
  const sink: LogSink = {
    trace: push('trace'),
    debug: push('debug'),
    info: push('info'),
    warn: push('warn'),
    error: push('error'),
  };
  return { logger: createLogger(sink), lines };
}
