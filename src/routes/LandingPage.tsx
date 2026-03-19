// src/routes/LandingPage.tsx

import { Activity, Boxes, ClipboardList, Sparkles, Workflow } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { buildAgentPairingSearchFromLocation } from "@/auth/agentPairingParams";
import { APP_TAGLINE } from "../appMeta";
import { AgentPixelMark } from "../components/agent/AgentPixelMark";
import { SuiteLogo } from "../components/brand/SuiteLogo";
import {
	AGENT_PROFILE_IDS,
	AGENT_PROFILES,
} from "../components/agent/agentProfiles";
import { Badge } from "../components/primitives/Badge";
import { Button } from "../components/primitives/Button";
import { Panel } from "../components/primitives/Panel";
import { HStack } from "../components/primitives/Stack";
import { Text } from "../components/primitives/Text";
import styles from "./LandingPage.module.css";

const AGENT_IDS = AGENT_PROFILE_IDS;
const COMMAND_SIGNALS = [
	{
		icon: Activity,
		label: "Live telemetry",
		value: "Watchdog sessions, collectors, and runtime health",
	},
	{
		icon: Workflow,
		label: "Ops flow",
		value: "Projects, tasks, deadlines, and delivery scope",
	},
	{
		icon: Sparkles,
		label: "Agent coordination",
		value: "Agents, engineering apps, and shared context",
	},
] as const;

const HERO_SUMMARY_ITEMS = [
	{
		icon: ClipboardList,
		label: "Delivery scope",
		value: "Projects, revisions, transmittals, and review checkpoints stay in one workflow.",
	},
	{
		icon: Boxes,
		label: "CAD execution",
		value: "Markup planning, CAD preflight, and bridge-backed automation run through the same control surface.",
	},
	{
		icon: Activity,
		label: "Runtime state",
		value: "Collectors, health signals, and route diagnostics stay visible while you work.",
	},
	{
		icon: Sparkles,
		label: "Shared context",
		value: "Agents, architecture, and work ledger history stay aligned instead of fragmenting across tools.",
	},
] as const;

export default function LandingPage() {
	const { user } = useAuth();
	const location = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		const pairingSearch = buildAgentPairingSearchFromLocation(
			location.search,
			location.hash,
		);
		if (!pairingSearch) {
			return;
		}

		navigate(
			{
				pathname: "/agent/pairing-callback",
				search: pairingSearch,
			},
			{ replace: true },
		);
	}, [location.hash, location.search, navigate]);

	return (
		<div className={styles.root}>
			<div className={styles.ambientTop} aria-hidden="true" />
			<div className={styles.ambientBottom} aria-hidden="true" />

			<nav className={styles.nav}>
				<div className={styles.navContainer}>
					<Link to="/" className={styles.brandLink}>
						<SuiteLogo variant="compact" size="md" />
					</Link>

					<HStack gap={2} align="center">
						<Link to="/login" className={styles.navActionLink}>
							<Button variant="primary" size="sm">
								Sign in
							</Button>
						</Link>
					</HStack>
				</div>
			</nav>

			<main className={styles.main}>
				<section className={styles.hero}>
					<div className={styles.heroBackground} />
					<div className={styles.heroPattern} />

					<div className={styles.heroGrid}>
						<div className={styles.heroLeft}>
							<Badge
								color="default"
								variant="outline"
								className={styles.heroBadge}
							>
								<span className={styles.heroBadgeDot} />
								Engineering ops
							</Badge>

							<h1 className={styles.heroTitle}>
								One control surface for{" "}
								<span className={styles.heroHighlight}>
									projects, drawings, and AI execution.
								</span>
							</h1>

							<Text color="muted" size="md" className={styles.heroCopy}>
								{APP_TAGLINE}. Coordinate project operations, monitor telemetry,
								and run specialized agents without context-switching between
								separate tools.
							</Text>

							<div className={styles.heroSignalGrid}>
								{COMMAND_SIGNALS.map((signal) => (
									<div key={signal.label} className={styles.heroSignalCard}>
										<signal.icon className={styles.heroSignalIcon} />
										<div>
											<div className={styles.heroSignalLabel}>
												{signal.label}
											</div>
											<div className={styles.heroSignalValue}>
												{signal.value}
											</div>
										</div>
									</div>
								))}
							</div>

							<HStack gap={3} wrap className={styles.heroCtaRow}>
								<Link to={user ? "/app/dashboard" : "/login"}>
									<Button variant="primary" size="sm">
										{user ? "Open Suite" : "Sign in"}
									</Button>
								</Link>
							</HStack>
						</div>

						<div className={styles.heroRight}>
							<Panel
								variant="default"
								padding="md"
								className={styles.heroSummaryPanel}
							>
								<div className={styles.heroSummaryHeader}>
									<Text size="xs" weight="semibold" className={styles.heroSummaryEyebrow}>
										Operations inside Suite
									</Text>
									<Text as="h2" size="lg" weight="semibold" block>
										One workspace for delivery, CAD flow, and execution control
									</Text>
									<Text size="sm" color="muted" block>
										The same surface tracks project delivery, CAD readiness,
										runtime health, and agent-assisted work without a second tool
										stack.
									</Text>
								</div>

								<div className={styles.heroSummaryGrid}>
									{HERO_SUMMARY_ITEMS.map((item) => (
										<div key={item.label} className={styles.heroSummaryCard}>
											<div className={styles.heroSummaryIconShell}>
												<item.icon className={styles.heroSummaryIcon} />
											</div>
											<div>
												<Text
													size="sm"
													weight="semibold"
													className={styles.heroSummaryLabel}
													block
												>
													{item.label}
												</Text>
												<Text
													size="xs"
													color="muted"
													className={styles.heroSummaryValue}
													block
												>
													{item.value}
												</Text>
											</div>
										</div>
									))}
								</div>
							</Panel>
						</div>
					</div>
				</section>

				<section className={styles.agentsSection}>
					<div className={styles.sectionHeading}>
						<Text as="h2" size="lg" weight="semibold" block>
							Agent operations layer
						</Text>
						<Text size="sm" color="muted" className={styles.sectionCopy} block>
							Specialized profiles operate independently and coordinate through
							shared context when needed.
						</Text>
					</div>
					<Panel variant="default" padding="lg" className={styles.agentsPanel}>
						<Badge color="accent" variant="soft" className={styles.agentsBadge}>
							<span className={styles.agentsBadgeDot} />
							Profile-driven agents
						</Badge>

						<Text as="h2" size="xl" weight="semibold" block>
							Six profiles, built for distinct tasks
						</Text>
						<Text color="muted" size="sm" className={styles.agentsCopy} block>
							Each profile has its own memory scope and specialization. Run one
							at a time or coordinate across profiles when needed.
						</Text>

						<div className={styles.agentGrid}>
							{AGENT_IDS.map((id) => {
								const profile = AGENT_PROFILES[id];
								return (
									<div key={id} className={styles.agentCard}>
										<div className={styles.agentMark}>
											<AgentPixelMark
												profileId={id}
												size={32}
												detailLevel="hero"
												expression="neutral"
											/>
										</div>
										<div>
											<Text size="sm" weight="semibold" block>
												{profile.name}
											</Text>
											<Text
												size="xs"
												color="muted"
												className={styles.agentTagline}
												block
											>
												{profile.tagline}
											</Text>
										</div>
									</div>
								);
							})}
						</div>
					</Panel>
				</section>

				<footer className={styles.footer}>
					<HStack gap={2} align="center" className={styles.footerBrand}>
						<SuiteLogo variant="compact" size="sm" />
					</HStack>

					<HStack gap={4} className={styles.footerLinks}>
						<Link to="/privacy" className={styles.footerLink}>
							Privacy
						</Link>
					</HStack>
				</footer>
			</main>
		</div>
	);
}
