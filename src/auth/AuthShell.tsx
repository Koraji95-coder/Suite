// src/auth/AuthShell.tsx
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { APP_NAME, APP_TAGLINE } from "@/appMeta";
import { AgentPixelMark } from "@/components/agent/AgentPixelMark";
import { AGENT_PROFILES } from "@/components/agent/agentProfiles";
import type { AgentProfileId } from "@/components/agent/agentProfiles";
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

const FLOATING_MARKS: {
	id: AgentProfileId;
	size: number;
	top: string;
	left: string;
	delay: string;
}[] = [
	{ id: "koro", size: 68, top: "22%", left: "50%", delay: "0s" },
	{ id: "devstral", size: 34, top: "56%", left: "24%", delay: "0.45s" },
	{ id: "forge", size: 28, top: "72%", left: "68%", delay: "0.95s" },
];

const ACCESS_SIGNALS = [
	{ label: "Session", value: "Passwordless link flow" },
	{ label: "Protection", value: "Verified redirect + guardrails" },
	{ label: "Profiles", value: "Profile-based operations context" },
] as const;

export default function AuthShell({
	children,
	navLink,
	hidePanel,
	cardClassName,
	cardStyle,
}: AuthShellProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const id = requestAnimationFrame(() => setMounted(true));
		return () => cancelAnimationFrame(id);
	}, []);

	return (
		<div className={styles.root}>
			<div className={styles.ambientTop} aria-hidden="true" />
			<div className={styles.ambientBottom} aria-hidden="true" />

			<nav className={styles.nav}>
				<Link to="/" className={styles.brandLink} aria-label={`${APP_NAME} home`}>
					<AgentPixelMark
						profileId="koro"
						size={28}
						detailLevel="hero"
						expression="neutral"
					/>
					<span className={styles.brandName}>{APP_NAME}</span>
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
						mounted ? styles.contentGridVisible : styles.contentGridHidden,
					)}
				>
					{!hidePanel && (
						<section className={styles.leftPanel}>
							<div className={styles.leftPanelGradient} />
							<div className={styles.leftPanelPattern} />

							<div className={styles.leftPanelContent}>
								<div className={styles.leftEyebrow}>Operations access</div>

								<div className={styles.floatArea}>
									{FLOATING_MARKS.map((mark) => (
										<div
											key={mark.id}
											className={styles.floatMark}
											style={{
												top: mark.top,
												left: mark.left,
												transform: "translate(-50%, -50%)",
												animationDelay: mark.delay,
												opacity: mounted ? 1 : 0,
												transition: `opacity 0.8s ease ${mark.delay}`,
											}}
										>
											<AgentPixelMark
												profileId={mark.id}
												size={mark.size}
												detailLevel="hero"
												expression={mark.id === "koro" ? "active" : "neutral"}
											/>
										</div>
									))}
									<div className={styles.floatSpacer} aria-hidden="true" />
								</div>

								<div className={styles.brandBlock}>
									<Text size="xl" weight="semibold" block>
										{APP_NAME}
									</Text>
									<Text size="sm" color="muted" className={styles.tagline} block>
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
									{FLOATING_MARKS.map((mark) => (
										<div key={mark.id} className={styles.agentBadge}>
											<AgentPixelMark profileId={mark.id} size={12} detailLevel="hero" />
											<Text size="xs" color="muted" className={styles.agentName}>
												{AGENT_PROFILES[mark.id].name}
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
