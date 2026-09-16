export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const fail = <E>(reason: E): Result<never, E> => ({ ok: false, reason });
