type ErrorSeverity = "info" | "warn" | "error" | "critical";

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

	private getSeverityEmoji(severity: ErrorSeverity): string {
		switch (severity) {
			case "info":
				return "ℹ️";
			case "warn":
				return "⚠️";
			case "error":
				return "❌";
			case "critical":
				return "🚨";
		}
	}

	private formatLog(log: ErrorLog): void {
		const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
		if (!isDev) return;

		const payload = {
			emoji: this.getSeverityEmoji(log.severity),
			severity: log.severity.toUpperCase(),
			context: log.context,
			message: log.message,
			timestamp: log.timestamp,
			data: log.data,
			stack: log.stack,
		};

		void fetch("/__log", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		}).catch(() => {
			// If the dev server log endpoint is unavailable, drop silently.
		});
	}

	log(
		severity: ErrorSeverity,
		context: string,
		message: string,
		data?: unknown,
		error?: Error,
	): void {
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
		this.log("info", context, message, data);
	}

	warn(context: string, message: string, data?: unknown): void {
		this.log("warn", context, message, data);
	}

	error(context: string, message: string, data?: unknown, error?: Error): void {
		this.log("error", context, message, data, error);
	}

	critical(
		context: string,
		message: string,
		data?: unknown,
		error?: Error,
	): void {
		this.log("critical", context, message, data, error);
	}

	debug(context: string, message: string, data?: unknown): void {
		this.log("info", context, message, data);
	}

	getLogs(severity?: ErrorSeverity): ErrorLog[] {
		if (!severity) return this.logs;
		return this.logs.filter((log) => log.severity === severity);
	}

	clearLogs(): void {
		this.logs = [];
		this.info("ErrorLogger", "Logs cleared");
	}

	exportLogs(): string {
		return JSON.stringify(this.logs, null, 2);
	}
}

export const logger = new ErrorLogger();
