import React from "react";
import { Button } from "@/components/primitives/Button";
import { logger } from "@/lib/logger";
import styles from "./AgentPanelBoundary.module.css";

interface AgentPanelBoundaryProps {
	children: React.ReactNode;
	onResetPanelCache: () => void;
}

interface AgentPanelBoundaryState {
	hasError: boolean;
	errorMessage: string;
}

export class AgentPanelBoundary extends React.Component<
	AgentPanelBoundaryProps,
	AgentPanelBoundaryState
> {
	state: AgentPanelBoundaryState = {
		hasError: false,
		errorMessage: "",
	};

	static getDerivedStateFromError(error: Error): AgentPanelBoundaryState {
		return {
			hasError: true,
			errorMessage: error?.message || "Unexpected panel error.",
		};
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		logger.error("Agent panel render crashed.", "AgentPanelBoundary", {
			stage: "render",
			message: error?.message || "Unknown render failure",
			stack: error?.stack || "",
			componentStack: errorInfo.componentStack || "",
		});
	}

	private handleReset = () => {
		this.props.onResetPanelCache();
		this.setState({ hasError: false, errorMessage: "" });
	};

	render() {
		if (!this.state.hasError) {
			return this.props.children;
		}

		return (
			<div className={styles.root}>
				<div className={styles.card}>
					<h3 className={styles.title}>Agent panel recovered mode</h3>
					<p className={styles.message}>
						{this.state.errorMessage || "Something failed in the panel render path."}
					</p>
					<div className={styles.actions}>
						<Button variant="outline" size="sm" onClick={this.handleReset}>
							Reset panel cache
						</Button>
						<Button
							variant="primary"
							size="sm"
							onClick={() => window.location.reload()}
						>
							Reload panel
						</Button>
					</div>
				</div>
			</div>
		);
	}
}
