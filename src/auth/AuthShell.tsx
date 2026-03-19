// src/auth/AuthShell.tsx
import { type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { APP_NAME, APP_TAGLINE } from "@/appMeta";
import { AgentPixelMark } from "@/components/agent/AgentPixelMark";
import { AGENT_PROFILES } from "@/components/agent/agentProfiles";
import type { AgentProfileId } from "@/components/agent/agentProfiles";
import { SuiteLogo } from "@/components/brand/SuiteLogo";
import { Button } from "@/components/primitives/Button";
import { HStack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import styles from "./AuthShell.module.css";

type AuthShellProps = {
	children: ReactNode;
	navLink?: { to: string; label: string };
	hidePanel?: boolean;
	cardClassName?: string;
	cardStyle?: CSSProperties;
};

const AUTH_HEADER_AGENT_IDS: AgentProfileId[] = ["koro", "devstral", "forge"];

const ACCESS_SIGNALS = [
	{ label: "Authentication", value: "Passkeys, email links, and trusted sessions" },
	{ label: "Verification", value: "Brokered pairing when agent trust is required" },
	{ label: "Scope", value: "Projects, telemetry, and operations context" },
] as const;

export default function AuthShell({
	children,
	navLink,
	hidePanel,
	cardClassName,
	cardStyle,
}: AuthShellProps) {
	return (
		<div className={styles.root}>
			<div className={styles.ambientTop} aria-hidden="true" />
			<div className={styles.ambientBottom} aria-hidden="true" />

			<nav className={styles.nav}>
				<Link
					to="/"
					className={styles.brandLink}
					aria-label={`${APP_NAME} home`}
				>
					<SuiteLogo variant="compact" size="md" />
				</Link>

				<div className={styles.navRight}>
					<span className={styles.navStatus}>Secure auth surface</span>
					{navLink && (
						<Link to={navLink.to}>
							<Button variant="secondary" size="sm">
								{navLink.label}
							</Button>
						</Link>
					)}
				</div>
			</nav>

			<main className={styles.main}>
				<div
					className={cn(
						styles.contentGrid,
						!hidePanel && styles.contentGridWithPanel,
					)}
				>
					{!hidePanel && (
						<section className={styles.leftPanel}>
							<div className={styles.leftPanelGradient} />
							<div className={styles.leftPanelPattern} />

							<div className={styles.leftPanelContent}>
								<div className={styles.leftEyebrow}>Operations access</div>

								<div className={styles.brandBlock}>
									<div className={styles.brandLogoWrap}>
										<SuiteLogo variant="full" size="lg" />
									</div>
									<Text size="xl" weight="semibold" block>
										Operations access
									</Text>
									<Text
										size="sm"
										color="muted"
										className={styles.tagline}
										block
									>
										{APP_TAGLINE}
									</Text>
								</div>

								<div className={styles.signalGrid}>
									{ACCESS_SIGNALS.map((signal) => (
										<div key={signal.label} className={styles.signalCard}>
											<div className={styles.signalLabel}>{signal.label}</div>
											<div className={styles.signalValue}>{signal.value}</div>
										</div>
									))}
								</div>
							</div>
						</section>
					)}

					<section
						className={cn(
							styles.rightPanel,
							!hidePanel && styles.rightPanelWithLeft,
							cardClassName,
						)}
						style={cardStyle}
					>
						<div className={styles.topAccent} />
						<div className={styles.rightPanelHeader}>
							<div>
								<Text size="xs" color="muted">
									Workspace authentication
								</Text>
								<HStack gap={2} className={styles.agentBadgeRow} wrap>
									{AUTH_HEADER_AGENT_IDS.map((id) => (
										<div key={id} className={styles.agentBadge}>
											<AgentPixelMark
												profileId={id}
												size={14}
												detailLevel="hero"
											/>
											<Text
												size="xs"
												color="muted"
												className={styles.agentName}
											>
												{AGENT_PROFILES[id].name}
											</Text>
										</div>
									))}
								</HStack>
							</div>
						</div>
						<div className={styles.rightPanelBody}>{children}</div>
					</section>
				</div>
			</main>
		</div>
	);
}
