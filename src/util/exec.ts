import { execFile } from 'node:child_process';
import type { CancellationToken } from './cancellation';
import { fail, ok, type Result } from './result';

export interface ExecRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly cwd?: string;
  readonly token?: CancellationToken;
}

export interface ExecOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export type ExecFailure =
  | { readonly kind: 'not-found'; readonly command: string }
  | { readonly kind: 'timeout'; readonly timeoutMs: number }
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'exit';
      readonly exitCode: number;
      readonly stdout: string;
      readonly stderr: string;
    }
  | { readonly kind: 'spawn-error'; readonly message: string };

export type ExecResult = Result<ExecOutput, ExecFailure>;
export type Exec = (request: ExecRequest) => Promise<ExecResult>;

const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

interface NodeExecError extends Error {
  readonly code?: string | number;
  readonly killed?: boolean;
  readonly signal?: string;
}

function classify(
  error: NodeExecError,
  request: ExecRequest,
  stdout: string,
  stderr: string,
): ExecFailure {
  if (request.token?.isCancellationRequested === true) {
    return { kind: 'cancelled' };
  }
  if (error.code === 'ENOENT') {
    return { kind: 'not-found', command: request.command };
  }
  if (error.killed === true || error.signal === 'SIGTERM' || error.signal === 'SIGKILL') {
    return { kind: 'timeout', timeoutMs: request.timeoutMs };
  }
  if (typeof error.code === 'number') {
    return { kind: 'exit', exitCode: error.code, stdout, stderr };
  }
  return { kind: 'spawn-error', message: error.message };
}

function spawn(request: ExecRequest, resolve: (result: ExecResult) => void): void {
  const state: { subscription: { readonly dispose: () => void } | undefined } = {
    subscription: undefined,
  };
  const child = execFile(
    request.command,
    [...request.args],
    { cwd: request.cwd, timeout: request.timeoutMs, maxBuffer: MAX_BUFFER_BYTES, encoding: 'utf8' },
    (error, stdout, stderr) => {
      state.subscription?.dispose();
      if (error === null) {
        resolve(ok({ stdout, stderr, exitCode: 0 }));
        return;
      }
      resolve(fail(classify(error as NodeExecError, request, stdout, stderr)));
    },
  );
  state.subscription = request.token?.onCancellationRequested(() => child.kill('SIGTERM'));
}

export function createExec(): Exec {
  return (request) =>
    new Promise<ExecResult>((resolve) => {
      if (request.token?.isCancellationRequested === true) {
        resolve(fail({ kind: 'cancelled' }));
        return;
      }
      try {
        spawn(request, resolve);
      } catch (error) {
        resolve(
          fail({
            kind: 'spawn-error',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });
}
