/**
 * Centralized logging system for the Suite application
 * Replaces scattered console.log/warn/error calls with structured logging
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
  error?: Error;
}

class Logger {
  private static instance: Logger;
  private isDevelopment: boolean;
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 1000; // Keep last 1000 logs in memory

  private constructor() {
    this.isDevelopment = import.meta.env.DEV;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: string,
    data?: unknown,
    error?: Error
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data,
      error,
    };
  }

  private formatLog(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level}]`,
      entry.context ? `[${entry.context}]` : '',
      entry.message,
    ].filter(Boolean);
    return parts.join(' ');
  }

  private addToHistory(entry: LogEntry): void {
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }
  }

  private log(
    level: LogLevel,
    message: string,
    context?: string,
    data?: unknown,
    error?: Error
  ): void {
    const entry = this.createLogEntry(level, message, context, data, error);
    this.addToHistory(entry);

    const formattedMessage = this.formatLog(entry);

    if (this.isDevelopment) {
      switch (level) {
        case LogLevel.DEBUG:
          console.log(formattedMessage, data || '');
          break;
        case LogLevel.INFO:
          console.info(formattedMessage, data || '');
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage, data || '');
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage, error || data || '');
          if (error?.stack) {
            console.error(error.stack);
          }
          break;
      }
    } else {
      // In production, you might want to send logs to a service
      // For now, only log warnings and errors
      if (level === LogLevel.WARN || level === LogLevel.ERROR) {
        console[level === LogLevel.WARN ? 'warn' : 'error'](formattedMessage);
      }
    }
  }

  debug(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, context, data);
  }

  info(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, context, data);
  }

  warn(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, context, data);
  }

  error(message: string, context?: string, error?: Error | unknown): void {
    const errorObj = error instanceof Error ? error : undefined;
    const data = error instanceof Error ? undefined : error;
    this.log(LogLevel.ERROR, message, context, data, errorObj);
  }

  getHistory(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logHistory.filter((entry) => entry.level === level);
    }
    return [...this.logHistory];
  }

  clearHistory(): void {
    this.logHistory = [];
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions for cleaner imports
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
