export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export type Logger = {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
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
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (isLogLevel(configured)) return configured;
  if (process.env.NODE_ENV === "test") return "error";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
};

const serializeError = (error: unknown): LogFields => {
  if (error instanceof Error) {
    return {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    };
  }
  return { error };
};

const format = (
  level: LogLevel,
  scope: string | undefined,
  message: string,
  fields: LogFields,
): string => {
  const record = {
    level,
    time: new Date().toISOString(),
    ...(scope ? { scope } : {}),
    message,
    ...fields,
  };

  if (process.env.NODE_ENV === "production") {
    return `${JSON.stringify(record)}\n`;
  }

  const prefix = scope ? `[${level}] (${scope})` : `[${level}]`;
  const rest = Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : "";
  return `${prefix} ${message}${rest}\n`;
};

// stdout/stderr rather than console so the module needs no eslint escape
// hatch and tests can assert on the exact emitted record.
const write = (level: LogLevel, line: string) => {
  if (level === "warn" || level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
};

export const createLogger = (scope?: string): Logger => {
  const emit = (level: LogLevel, message: string, fields: LogFields = {}) => {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[resolveLevel()]) return;
    write(level, format(level, scope, message, fields));
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, error, fields) =>
      emit("error", message, {
        ...(error === undefined ? {} : serializeError(error)),
        ...fields,
      }),
    child: (childScope) =>
      createLogger(scope ? `${scope}:${childScope}` : childScope),
  };
};

export const logger = createLogger();
