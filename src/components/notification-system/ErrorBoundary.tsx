import React from "react";
import { logger } from "../../lib/logger";

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
	{ children: React.ReactNode },
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = { hasError: false, error: null, errorInfo: null };

	static getDerivedStateFromError(error: Error) {
		return { hasError: true, error, errorInfo: null };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		logger.error("Caught error in ErrorBoundary", "ErrorBoundary", error);

		if (errorInfo.componentStack) {
			logger.debug("Component stack trace", "ErrorBoundary", {
				componentStack: errorInfo.componentStack,
			});
		}

		this.setState({ errorInfo });
	}

	render() {
		if (!this.state.hasError) return this.props.children;

		const isDev = import.meta.env.DEV;

		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-8 [color:var(--text)]">
				<div className="max-w-150 rounded-xl border p-6 text-center [background:color-mix(in_srgb,var(--surface)_80%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
					<h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
					<p className="mb-4 text-[13px] [color:var(--text-muted)]">
						{this.state.error?.message || "An unexpected error occurred."}
					</p>

					{isDev && this.state.error?.stack && (
						<details className="mb-4 max-h-50 overflow-auto rounded-lg p-3 text-left font-mono text-[11px] [background:color-mix(in_srgb,var(--background)_50%,transparent)]">
							<summary className="mb-2 cursor-pointer text-xs">
								Stack Trace
							</summary>
							<pre className="m-0 wrap-break-word whitespace-pre-wrap">
								{this.state.error.stack}
							</pre>
						</details>
					)}

					<button
						onClick={() => {
							this.setState({ hasError: false, error: null, errorInfo: null });
							window.location.reload();
						}}
						className="rounded-lg border-none px-5 py-2 text-[13px] font-semibold [background:var(--primary)] [color:var(--primary-contrast)]"
					>
						Reload
					</button>
				</div>
			</div>
		);
	}
}
