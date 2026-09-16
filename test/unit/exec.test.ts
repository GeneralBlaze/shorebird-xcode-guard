import { describe, expect, it } from 'vitest';
import { createExec, type ExecResult } from '../../src/util/exec';
import { createCancellationSource } from '../../src/util/cancellation';

const node = process.execPath;

describe('exec', () => {
  it('captures stdout and exit code on success', async () => {
    const exec = createExec();
    const result = await exec({ command: node, args: ['-e', 'process.stdout.write("hi")'], timeoutMs: 5000 });
    expect(result).toEqual<ExecResult>({ ok: true, value: { stdout: 'hi', stderr: '', exitCode: 0 } });
  });

  it('reports non-zero exit as a failure carrying stderr', async () => {
    const exec = createExec();
    const result = await exec({
      command: node,
      args: ['-e', 'process.stderr.write("bad"); process.exit(3)'],
      timeoutMs: 5000,
    });
    expect(result).toEqual({
      ok: false,
      reason: { kind: 'exit', exitCode: 3, stdout: '', stderr: 'bad' },
    });
  });

  it('reports a missing binary as not-found', async () => {
    const exec = createExec();
    const result = await exec({ command: '/nonexistent/definitely-missing', args: [], timeoutMs: 5000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.kind).toBe('not-found');
    }
  });

  it('times out and kills the child', async () => {
    const exec = createExec();
    const started = Date.now();
    const result = await exec({ command: node, args: ['-e', 'setTimeout(()=>{}, 10000)'], timeoutMs: 200 });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.kind).toBe('timeout');
    }
  });

  it('cancels when the token fires', async () => {
    const exec = createExec();
    const source = createCancellationSource();
    const pending = exec({
      command: node,
      args: ['-e', 'setTimeout(()=>{}, 10000)'],
      timeoutMs: 10000,
      token: source.token,
    });
    source.cancel();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.kind).toBe('cancelled');
    }
  });

  it('returns cancelled immediately when the token is already cancelled', async () => {
    const exec = createExec();
    const source = createCancellationSource();
    source.cancel();
    const result = await exec({ command: node, args: ['-e', ''], timeoutMs: 1000, token: source.token });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.kind).toBe('cancelled');
    }
  });

  it('passes cwd to the child', async () => {
    const exec = createExec();
    const result = await exec({
      command: node,
      args: ['-e', 'process.stdout.write(process.cwd())'],
      timeoutMs: 5000,
      cwd: '/',
    });
    expect(result).toEqual({ ok: true, value: { stdout: '/', stderr: '', exitCode: 0 } });
  });
});
