import pino, { type Logger, type LoggerOptions } from 'pino';

export type AppLogger = Logger;

export function createLogger(level: LoggerOptions['level'] = 'info'): AppLogger {
  return pino({
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}