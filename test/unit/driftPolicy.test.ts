import { describe, expect, it } from 'vitest';
import { resolveAction, type DriftPolicy } from '../../src/domain/driftPolicy';

const policy = (blockOn: DriftPolicy['blockOn'], warnOn: DriftPolicy['warnOn']): DriftPolicy => ({
  blockOn,
  warnOn,
});

describe('resolveAction', () => {
  it('allows ok regardless of policy', () => {
    expect(resolveAction('ok', policy('patch-drift', 'patch-drift'))).toBe('allow');
  });
  it('warns on unknown regardless of policy', () => {
    expect(resolveAction('unknown', policy('never', 'never'))).toBe('warn');
  });
  it('blocks major-drift with default policy', () => {
    expect(resolveAction('major-drift', policy('minor-drift', 'patch-drift'))).toBe('block');
  });
  it('blocks minor-drift with default policy', () => {
    expect(resolveAction('minor-drift', policy('minor-drift', 'patch-drift'))).toBe('block');
  });
  it('warns on patch-drift with default policy', () => {
    expect(resolveAction('patch-drift', policy('minor-drift', 'patch-drift'))).toBe('warn');
  });
  it('never blocks when blockOn is never', () => {
    expect(resolveAction('major-drift', policy('never', 'patch-drift'))).toBe('warn');
  });
  it('allows patch-drift when warnOn is minor-drift', () => {
    expect(resolveAction('patch-drift', policy('minor-drift', 'minor-drift'))).toBe('allow');
  });
  it('allows minor-drift when both thresholds are major-drift', () => {
    expect(resolveAction('minor-drift', policy('major-drift', 'major-drift'))).toBe('allow');
  });
  it('blocks patch-drift when blockOn is patch-drift', () => {
    expect(resolveAction('patch-drift', policy('patch-drift', 'never'))).toBe('block');
  });
  it('allows everything when both are never except unknown', () => {
    expect(resolveAction('major-drift', policy('never', 'never'))).toBe('allow');
  });
  it('block takes precedence over warn', () => {
    expect(resolveAction('minor-drift', policy('minor-drift', 'minor-drift'))).toBe('block');
  });
});
