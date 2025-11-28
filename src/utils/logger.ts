/**
 * Advanced application logger with colors, multi-arg support,
 * pretty object formatting, debug mode, and module tagging.
 */
export class Logger {
  private static readonly colors = {
    reset: "\x1b[0m",
    gray: "\x1b[90m",
    info: "\x1b[36m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
    debug: "\x1b[35m"
  };

  /**
   * Formats the timestamp, level and module tag.
   */
  private static header(level: string, module?: string): string {
    const ts = new Date().toISOString();
    const tag = module ? ` [${module}]` : "";
    return `${Logger.colors.gray}[${ts}]${Logger.colors.reset} ${level}${tag}`;
  }

  /**
   * Converts unknown values into a readable string.
   */
  private static stringify(data: unknown): string {
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data, null, 2); // Pretty objects
    } catch {
      return String(data);
    }
  }

  /**
   * Internal log generator for all log levels.
   */
  private static emit(color: string, label: string, module: string | undefined, args: unknown[]) {
    const formatted = args.map(Logger.stringify).join(" ");
    console.log(`${Logger.header(color + label + Logger.colors.reset, module)} ${color}${formatted}${Logger.colors.reset}`);
  }

  /**
   * Logs an informational message.
   */
  static info(...args: unknown[]): void;
  static info(module: string, ...args: unknown[]): void;
  static info(moduleOrArg: unknown, ...args: unknown[]): void {
    if (typeof moduleOrArg === "string" && moduleOrArg.startsWith("@")) {
      Logger.emit(Logger.colors.info, "INFO", moduleOrArg.slice(1), args);
    } else {
      Logger.emit(Logger.colors.info, "INFO", undefined, [moduleOrArg, ...args]);
    }
  }

  /**
   * Logs a warning message.
   */
  static warn(...args: unknown[]): void;
  static warn(module: string, ...args: unknown[]): void;
  static warn(moduleOrArg: unknown, ...args: unknown[]): void {
    if (typeof moduleOrArg === "string" && moduleOrArg.startsWith("@")) {
      Logger.emit(Logger.colors.warn, "WARN", moduleOrArg.slice(1), args);
    } else {
      Logger.emit(Logger.colors.warn, "WARN", undefined, [moduleOrArg, ...args]);
    }
  }

  /**
   * Logs an error message.
   */
  static error(...args: unknown[]): void;
  static error(module: string, ...args: unknown[]): void;
  static error(moduleOrArg: unknown, ...args: unknown[]): void {
    if (typeof moduleOrArg === "string" && moduleOrArg.startsWith("@")) {
      Logger.emit(Logger.colors.error, "ERROR", moduleOrArg.slice(1), args);
    } else {
      Logger.emit(Logger.colors.error, "ERROR", undefined, [moduleOrArg, ...args]);
    }
  }

  /**
   * Logs a debug message.
   * Only visible when DEBUG_ENABLED=true.
   */
  static debug(...args: unknown[]): void;
  static debug(module: string, ...args: unknown[]): void;
  static debug(moduleOrArg: unknown, ...args: unknown[]): void {
    if (process.env.DEBUG_ENABLED !== "true") return;

    if (typeof moduleOrArg === "string" && moduleOrArg.startsWith("@")) {
      Logger.emit(Logger.colors.debug, "DEBUG", moduleOrArg.slice(1), args);
    } else {
      Logger.emit(Logger.colors.debug, "DEBUG", undefined, [moduleOrArg, ...args]);
    }
  }
}

/**
 * Default logger instance for simple imports.
 */
export const logger = Logger;
