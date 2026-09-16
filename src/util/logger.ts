export interface LogSink {
  readonly trace: (message: string) => void;
  readonly debug: (message: string) => void;
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
}

export interface Logger extends LogSink {
  readonly child: (scope: string) => Logger;
}

export function createLogger(sink: LogSink, prefix = ''): Logger {
  const format = (message: string): string => (prefix === '' ? message : `${prefix} ${message}`);
  return {
    trace: (message) => sink.trace(format(message)),
    debug: (message) => sink.debug(format(message)),
    info: (message) => sink.info(format(message)),
    warn: (message) => sink.warn(format(message)),
    error: (message) => sink.error(format(message)),
    child: (scope) => createLogger(sink, `${prefix === '' ? '' : `${prefix} `}[${scope}]`),
  };
}
