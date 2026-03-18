// src/auth/AuthShell.tsx
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { APP_NAME, APP_TAGLINE } from "@/appMeta";
import { AgentPixelMark } from "@/components/agent/AgentPixelMark";
import type { AgentProfileId } from "@/components/agent/agentProfiles";
import { Button } from "@/components/primitives/Button";
import { HStack } from "@/components/primitives/Stack";
// Primitives
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
	{ id: "koro", size: 72, top: "18%", left: "50%", delay: "0s" },
	{ id: "devstral", size: 36, top: "55%", left: "22%", delay: "0.6s" },
	{ id: "sentinel", size: 32, top: "38%", left: "78%", delay: "1.2s" },
	{ id: "forge", size: 28, top: "72%", left: "65%", delay: "1.8s" },
];

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
			{/* ═══════════════════════════════════════════════════════════════════
          NAV
      ═══════════════════════════════════════════════════════════════════ */}
			<nav className={styles.nav}>
				<Link
					to="/"
					className={styles.brandLink}
					aria-label={`${APP_NAME} home`}
				>
					<AgentPixelMark
						profileId="koro"
						size={28}
						detailLevel="hero"
						expression="neutral"
					/>
					<span className={styles.brandName}>{APP_NAME}</span>
				</Link>

				{navLink && (
					<Link to={navLink.to}>
						<Button variant="secondary" size="sm">
							{navLink.label}
						</Button>
					</Link>
				)}
			</nav>

			{/* ═══════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════════════════════════════ */}
			<main className={styles.main}>
				<div
					className={cn(
						styles.contentGrid,
						!hidePanel && styles.contentGridWithPanel,
					)}
					style={{
						opacity: mounted ? 1 : 0,
						transform: mounted ? "translateY(0)" : "translateY(12px)",
						transition: "opacity 0.5s ease, transform 0.5s ease",
					}}
				>
					{/* ─────────────────────────────────────────────────────────────────
              LEFT PANEL (Agent showcase)
          ───────────────────────────────────────────────────────────────── */}
					{!hidePanel && (
						<section className={styles.leftPanel}>
							<div className={styles.leftPanelGradient} />

							<div className={styles.leftPanelPattern} />

							{/* Content */}
							<div className={styles.leftPanelContent}>
								{/* Floating agent marks */}
								<div className={styles.floatArea}>
									{FLOATING_MARKS.map((m) => (
										<div
											key={m.id}
											className={styles.floatMark}
											style={{
												top: m.top,
												left: m.left,
												transform: "translate(-50%, -50%)",
												animationDelay: m.delay,
												opacity: mounted ? 1 : 0,
												transition: `opacity 0.8s ease ${m.delay}`,
											}}
										>
											<AgentPixelMark
												profileId={m.id}
												size={m.size}
												detailLevel="hero"
												expression={m.id === "koro" ? "active" : "neutral"}
											/>
										</div>
									))}
									<div className={styles.floatSpacer} aria-hidden="true" />
								</div>

								{/* Branding */}
								<div className={styles.brandBlock}>
									<Text size="xl" weight="semibold" block>
										{APP_NAME}
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

								{/* Agent badges */}
								<HStack
									gap={3}
									className={styles.agentBadgeRow}
									wrap
									justify="center"
								>
									{FLOATING_MARKS.map((m) => (
										<div key={m.id} className={styles.agentBadge}>
											<AgentPixelMark
												profileId={m.id}
												size={14}
												detailLevel="hero"
											/>
											<Text
												size="xs"
												color="muted"
												className={styles.agentName}
											>
												{m.id}
											</Text>
										</div>
									))}
								</HStack>
							</div>
						</section>
					)}

					{/* ─────────────────────────────────────────────────────────────────
              RIGHT PANEL (Form content)
          ───────────────────────────────────────────────────────────────── */}
						<section
							className={cn(
								styles.rightPanel,
								!hidePanel && styles.rightPanelWithLeft,
								cardClassName,
							)}
							style={cardStyle}
						>
							<div className={styles.topAccent} />

						{/* Content */}
						<div className={styles.rightPanelBody}>{children}</div>
					</section>
				</div>
			</main>
		</div>
	);
}
