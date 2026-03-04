import React from "react";
import { logger } from "../../lib/logger";
import styles from "./ErrorBoundary.module.css";

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
			<div className={styles.root}>
				<div className={styles.card}>
					<h2 className={styles.title}>Something went wrong</h2>
					<p className={styles.message}>
						{this.state.error?.message || "An unexpected error occurred."}
					</p>

					{isDev && this.state.error?.stack && (
						<details className={styles.details}>
							<summary className={styles.summary}>Stack Trace</summary>
							<pre className={styles.pre}>{this.state.error.stack}</pre>
						</details>
					)}

					<button
						onClick={() => {
							this.setState({ hasError: false, error: null, errorInfo: null });
							window.location.reload();
						}}
						className={styles.reloadButton}
					>
						Reload
					</button>
				</div>
			</div>
		);
	}
}
