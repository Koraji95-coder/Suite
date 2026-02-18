type ErrorSeverity = 'info' | 'warn' | 'error' | 'critical';

interface ErrorLog {
  timestamp: string;
  severity: ErrorSeverity;
  context: string;
  message: string;
  data?: unknown;
  stack?: string;
}

class ErrorLogger {
  private logs: ErrorLog[] = [];
  private maxLogs = 100;

  private getSeverityColor(severity: ErrorSeverity): string {
    switch (severity) {
      case 'info': return 'color: #3b82f6';
      case 'warn': return 'color: #f59e0b';
      case 'error': return 'color: #ef4444';
      case 'critical': return 'color: #dc2626; font-weight: bold';
    }
  }

  private getSeverityEmoji(severity: ErrorSeverity): string {
    switch (severity) {
      case 'info': return 'ℹ️';
      case 'warn': return '⚠️';
      case 'error': return '❌';
      case 'critical': return '🚨';
    }
  }

  private formatLog(log: ErrorLog): void {
    const emoji = this.getSeverityEmoji(log.severity);
    const style = this.getSeverityColor(log.severity);

    console.groupCollapsed(
      `%c${emoji} [${log.severity.toUpperCase()}] ${log.context}: ${log.message}`,
      style
    );
    console.log('Timestamp:', log.timestamp);
    if (log.data) {
      console.log('Data:', log.data);
    }
    if (log.stack) {
      console.log('Stack Trace:', log.stack);
    }
    console.groupEnd();
  }

  log(severity: ErrorSeverity, context: string, message: string, data?: unknown, error?: Error): void {
    const log: ErrorLog = {
      timestamp: new Date().toISOString(),
      severity,
      context,
      message,
      data,
      stack: error?.stack,
    };

    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.formatLog(log);
  }

  info(context: string, message: string, data?: unknown): void {
    this.log('info', context, message, data);
  }

  warn(context: string, message: string, data?: unknown): void {
    this.log('warn', context, message, data);
  }

  error(context: string, message: string, data?: unknown, error?: Error): void {
    this.log('error', context, message, data, error);
  }

  critical(context: string, message: string, data?: unknown, error?: Error): void {
    this.log('critical', context, message, data, error);
  }

  getLogs(severity?: ErrorSeverity): ErrorLog[] {
    if (!severity) return this.logs;
    return this.logs.filter(log => log.severity === severity);
  }

  clearLogs(): void {
    this.logs = [];
    console.clear();
    this.info('ErrorLogger', 'Logs cleared');
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = new ErrorLogger();
