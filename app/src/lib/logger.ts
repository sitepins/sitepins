/* eslint-disable no-console */

// The only sink available in the browser is the console, so this wraps it
// rather than replacing it. The value is the level gate — production builds
// stop shipping debug/info noise — plus one place to swap in a reporter.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export type Logger = {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  // warn and error take the caught value second — most call sites have one.
  warn(message: string, error?: unknown, fields?: LogFields): void;
  error(message: string, error?: unknown, fields?: LogFields): void;
  child(scope: string): Logger;
};

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isLogLevel = (value: string | undefined): value is LogLevel =>
  value !== undefined && value in LEVEL_WEIGHT;

const resolveLevel = (): LogLevel => {
  const configured = process.env.NEXT_PUBLIC_LOG_LEVEL?.toLowerCase();
  if (isLogLevel(configured)) return configured;
  return process.env.NODE_ENV === "production" ? "warn" : "debug";
};

const SINKS: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: (...args) => console.debug(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

export const createLogger = (scope?: string): Logger => {
  const prefix = scope ? `[${scope}]` : "";

  const emit = (level: LogLevel, message: string, extras: unknown[]) => {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[resolveLevel()]) return;
    SINKS[level](prefix ? `${prefix} ${message}` : message, ...extras);
  };

  const withFields = (fields?: LogFields) => (fields ? [fields] : []);
  const withError = (error: unknown, fields?: LogFields) => [
    ...(error === undefined ? [] : [error]),
    ...withFields(fields),
  ];

  return {
    debug: (message, fields) => emit("debug", message, withFields(fields)),
    info: (message, fields) => emit("info", message, withFields(fields)),
    warn: (message, error, fields) =>
      emit("warn", message, withError(error, fields)),
    error: (message, error, fields) =>
      emit("error", message, withError(error, fields)),
    child: (childScope) =>
      createLogger(scope ? `${scope}:${childScope}` : childScope),
  };
};

export const logger = createLogger();
