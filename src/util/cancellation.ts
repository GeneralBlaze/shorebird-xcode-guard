export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  readonly onCancellationRequested: (listener: () => void) => { readonly dispose: () => void };
}

export interface CancellationSource {
  readonly token: CancellationToken;
  readonly cancel: () => void;
}

export function createCancellationSource(): CancellationSource {
  const listeners = new Set<() => void>();
  const state = { cancelled: false };
  const token: CancellationToken = {
    get isCancellationRequested() {
      return state.cancelled;
    },
    onCancellationRequested: (listener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
  };
  const cancel = (): void => {
    if (state.cancelled) {
      return;
    }
    state.cancelled = true;
    listeners.forEach((listener) => listener());
    listeners.clear();
  };
  return { token, cancel };
}
