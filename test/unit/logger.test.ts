import { describe, expect, it } from 'vitest';
import { createLogger, type LogSink } from '../../src/util/logger';

const collect = (): { readonly lines: string[]; readonly sink: LogSink } => {
  const lines: string[] = [];
  const push = (level: string) => (message: string) => {
    lines.push(`${level}:${message}`);
  };
  return {
    lines,
    sink: {
      trace: push('trace'),
      debug: push('debug'),
      info: push('info'),
      warn: push('warn'),
      error: push('error'),
    },
  };
};

describe('logger', () => {
  it('forwards each level to the sink', () => {
    const { lines, sink } = collect();
    const logger = createLogger(sink);
    logger.info('a');
    logger.warn('b');
    logger.error('c');
    logger.debug('d');
    logger.trace('e');
    expect(lines).toEqual(['info:a', 'warn:b', 'error:c', 'debug:d', 'trace:e']);
  });

  it('prefixes child loggers with their scope', () => {
    const { lines, sink } = collect();
    createLogger(sink).child('xcode').info('scanned');
    expect(lines).toEqual(['info:[xcode] scanned']);
  });

  it('nests scopes', () => {
    const { lines, sink } = collect();
    createLogger(sink).child('a').child('b').warn('x');
    expect(lines).toEqual(['warn:[a] [b] x']);
  });
});
