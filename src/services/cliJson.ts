import { fail, ok, type Result } from '../util/result';

export interface CliEnvelope {
  readonly status: string;
  readonly data?: unknown;
  readonly error?: unknown;
  readonly meta: Readonly<Record<string, unknown>> | undefined;
}

export type EnvelopeFailure =
  | { readonly kind: 'invalid-json' }
  | { readonly kind: 'not-envelope' }
  | { readonly kind: 'status-failure'; readonly message: string; readonly cliVersion: string };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const stringField = (record: Record<string, unknown>, field: string): string | undefined => {
  const value = record[field];
  return typeof value === 'string' ? value : undefined;
};

export function cliVersionOf(envelope: CliEnvelope): string {
  const version = envelope.meta?.['version'];
  return typeof version === 'string' ? version : 'unknown';
}

export function parseEnvelope(stdout: string): Result<CliEnvelope, EnvelopeFailure> {
  const parsed = safeParse(stdout);
  if (parsed === undefined) {
    return fail({ kind: 'invalid-json' });
  }
  if (!isRecord(parsed) || typeof parsed['status'] !== 'string') {
    return fail({ kind: 'not-envelope' });
  }
  const envelope: CliEnvelope = {
    status: parsed['status'],
    data: parsed['data'],
    error: parsed['error'],
    meta: isRecord(parsed['meta']) ? parsed['meta'] : undefined,
  };
  if (envelope.status !== 'success') {
    const message =
      typeof envelope.error === 'string' ? envelope.error : JSON.stringify(envelope.error ?? '');
    return fail({ kind: 'status-failure', message, cliVersion: cliVersionOf(envelope) });
  }
  return ok(envelope);
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
