// src/routes/LandingPage.tsx

import {
	Activity,
	ArrowRight,
	Bot,
	CalendarDays,
	FolderOpen,
	Layers,
	ShieldCheck,
	Sparkles,
	Workflow,
	Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { buildAgentPairingSearchFromLocation } from "@/auth/agentPairingParams";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE } from "../appMeta";
import { AgentPixelMark } from "../components/agent/AgentPixelMark";
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

const FEATURES = [
	{
		icon: FolderOpen,
		title: "Project Manager",
		description:
			"Track projects, tasks, deliverables, and document control in a unified workspace.",
		to: "/app/projects",
	},
	{
		icon: Bot,
		title: "Koro Agent",
		description:
			"AI-powered task orchestration. Plan, generate, and review with contextual agents.",
		to: "/app/agent",
	},
	{
		icon: CalendarDays,
		title: "Calendar & Planning",
		description:
			"Drag-and-drop scheduling with urgency tracking and deadline visibility.",
		to: "/app/calendar",
	},
	{
		icon: Layers,
		title: "Engineering Apps",
		description:
			"Ground grid generator, drawing list manager, transmittal builder, and more.",
		to: "/app/apps",
	},
	{
		icon: Zap,
		title: "Math & Knowledge",
		description:
			"Three-phase calculators, formula banks, circuit generators, and IEEE/NEC references.",
		to: "/app/knowledge",
	},
	{
		icon: Sparkles,
		title: "Multi-Agent System",
		description:
			"Five specialized agents — Koro, Devstral, Sentinel, Forge, and Draftsmith — each built for distinct tasks.",
		to: "/app/agent",
	},
] as const;
const AGENT_IDS = AGENT_PROFILE_IDS;
const COMMAND_SIGNALS = [
	{
		icon: Activity,
		label: "Live telemetry",
		value: "Watchdog + sessions",
	},
	{
		icon: Workflow,
		label: "Ops flow",
		value: "Projects, tasks, deadlines",
	},
	{
		icon: ShieldCheck,
		label: "Secure access",
		value: "Passwordless and verified",
	},
] as const;

function useScrollAnimation(threshold = 0.1) {
	const ref = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsVisible(true);
					observer.unobserve(element);
				}
			},
			{ threshold },
		);

		observer.observe(element);
		return () => observer.disconnect();
	}, [threshold]);

	return { ref, isVisible };
}

export default function LandingPage() {
	const [mounted, setMounted] = useState(false);
	const [scrolled, setScrolled] = useState(false);
	const location = useLocation();
	const navigate = useNavigate();

	const featuresAnim = useScrollAnimation(0.1);
	const agentsAnim = useScrollAnimation(0.1);

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

	useEffect(() => {
		const id = requestAnimationFrame(() => setMounted(true));
		return () => cancelAnimationFrame(id);
	}, []);

	useEffect(() => {
		const handleScroll = () => {
			setScrolled(window.scrollY > 20);
		};
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	return (
		<div className={styles.root}>
			<div className={styles.ambientTop} aria-hidden="true" />
			<div className={styles.ambientBottom} aria-hidden="true" />

			<nav
				className={cn(
					styles.nav,
					scrolled ? styles.navScrolled : styles.navTop,
				)}
			>
				<div className={styles.navContainer}>
					<Link to="/" className={styles.brandLink}>
						<div
							className={cn(
								styles.brandMarkScale,
								scrolled ? styles.brandMarkSmall : styles.brandMarkNormal,
							)}
						>
							<AgentPixelMark
								profileId="koro"
								size={scrolled ? 24 : 28}
								detailLevel="hero"
								expression="neutral"
							/>
						</div>
						<span className={styles.brandLabel}>{APP_NAME}</span>
					</Link>

					<HStack gap={2} align="center">
						<Link to="/roadmap" className={styles.navAuxLink}>
							Roadmap
						</Link>
						<Link to="/privacy" className={styles.navAuxLink}>
							Privacy
						</Link>
						<Link to="/login">
							<Button variant="secondary" size="sm">
								Sign in
							</Button>
						</Link>
						<Link to="/signup">
							<Button variant="primary" size="sm">
								Get started
							</Button>
						</Link>
					</HStack>
				</div>
			</nav>

			<main className={styles.main}>
				<section
					className={cn(
						styles.hero,
						mounted ? styles.visible : styles.hiddenDown,
					)}
				>
					<div className={styles.heroBackground} />
					<div className={styles.heroPattern} />

					<div className={styles.heroGrid}>
						<div
							className={cn(
								styles.heroLeft,
								mounted ? styles.heroLeftVisible : styles.heroLeftHidden,
							)}
						>
							<Badge
								color="default"
								variant="outline"
								className={styles.heroBadge}
							>
								<span className={styles.heroBadgeDot} />
								Command-center workspace
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

							<HStack gap={3} wrap className={styles.heroFeatureBadges}>
								<Badge color="success" variant="outline" dot pulse>
									Passwordless sign-in
								</Badge>
								<Badge color="primary" variant="outline" dot>
									Email link verification
								</Badge>
							</HStack>

							<HStack gap={3} wrap className={styles.heroCtaRow}>
								<Link to="/signup">
									<Button variant="primary" size="sm">
										Start in Suite
									</Button>
								</Link>
								<Link to="/login">
									<Button variant="secondary" size="sm">
										Sign in
									</Button>
								</Link>
							</HStack>
						</div>

						<div
							className={cn(
								styles.heroRight,
								mounted ? styles.heroRightVisible : styles.heroRightHidden,
							)}
						>
							<div className={styles.mainAgentWrap}>
								<div className={styles.heroOrbit} aria-hidden="true" />
								<div className={styles.mainAgentInner}>
									<div className={styles.mainAgentGlow} />
									<div className={styles.mainAgentFloat}>
										<AgentPixelMark
											profileId="koro"
											size={120}
											detailLevel="hero"
											expression="active"
										/>
									</div>
								</div>

								<HStack
									gap={3}
									className={styles.heroSecondaryRow}
									justify="center"
								>
									{AGENT_IDS.filter((id) => id !== "koro").map((id, i) => (
										<div
											key={id}
											className={styles.heroSecondaryAgent}
											style={{ animationDelay: `${600 + i * 100}ms` }}
										>
											<AgentPixelMark
												profileId={id}
												size={28}
												detailLevel="hero"
											/>
										</div>
									))}
								</HStack>

								<div className={styles.heroAgentCaption}>
									Agent mesh with profile-specific memory and routing
								</div>
							</div>
						</div>
					</div>
				</section>

				<section ref={featuresAnim.ref} className={styles.featuresSection}>
					<div className={styles.sectionHeading}>
						<Text as="h2" size="lg" weight="semibold" block>
							Workspace modules
						</Text>
						<Text size="sm" color="muted" className={styles.sectionCopy} block>
							A cohesive operating layer across planning, delivery, and
							engineering execution.
						</Text>
					</div>
					<div className={styles.featuresGrid}>
						{FEATURES.map((f, i) => (
							<Link
								key={f.title}
								to={f.to}
								className={cn(
									styles.featureCard,
									featuresAnim.isVisible
										? styles.featureVisible
										: styles.featureHidden,
								)}
								style={{
									transitionDelay: featuresAnim.isVisible
										? `${i * 80}ms`
										: "0ms",
								}}
							>
								<div className={styles.featureIconWrap}>
									<f.icon className={styles.featureIcon} />
								</div>
								<Text as="h3" size="sm" weight="semibold" block>
									{f.title}
								</Text>
								<Text
									size="xs"
									color="muted"
									className={styles.featureCopy}
									block
								>
									{f.description}
								</Text>
								<ArrowRight className={styles.featureArrow} />
							</Link>
						))}
					</div>
				</section>

				<section ref={agentsAnim.ref} className={styles.agentsSection}>
					<div className={styles.sectionHeading}>
						<Text as="h2" size="lg" weight="semibold" block>
							Agent command layer
						</Text>
						<Text size="sm" color="muted" className={styles.sectionCopy} block>
							Specialized profiles operate independently and coordinate through
							shared context when needed.
						</Text>
					</div>
					<Panel
						variant="default"
						padding="lg"
						className={cn(
							styles.agentsPanel,
							agentsAnim.isVisible
								? styles.agentsPanelVisible
								: styles.agentsPanelHidden,
						)}
					>
						<Badge color="accent" variant="soft" className={styles.agentsBadge}>
							<span className={styles.agentsBadgeDot} />
							Multi-agent system
						</Badge>

						<Text as="h2" size="xl" weight="semibold" block>
							Five agents, built for distinct tasks
						</Text>
						<Text color="muted" size="sm" className={styles.agentsCopy} block>
							Each agent has its own memory namespace, personality, and
							specialization. Switch between them or let Koro orchestrate.
						</Text>

						<div className={styles.agentGrid}>
							{AGENT_IDS.map((id, i) => {
								const profile = AGENT_PROFILES[id];
								return (
									<div
										key={id}
										className={cn(
											styles.agentCard,
											agentsAnim.isVisible
												? styles.agentCardVisible
												: styles.agentCardHidden,
										)}
										style={{
											transitionDelay: agentsAnim.isVisible
												? `${200 + i * 100}ms`
												: "0ms",
										}}
									>
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

				<footer
					className={cn(
						styles.footer,
						mounted ? styles.footerVisible : styles.footerHidden,
					)}
				>
					<HStack gap={2} align="center" className={styles.footerBrand}>
						<AgentPixelMark profileId="koro" size={16} detailLevel="hero" />
						<Text size="xs" color="muted">
							{APP_NAME}
						</Text>
					</HStack>

					<HStack gap={4} className={styles.footerLinks}>
						<Link to="/privacy" className={styles.footerLink}>
							Privacy
						</Link>
						<Link to="/roadmap" className={styles.footerLink}>
							Roadmap
						</Link>
					</HStack>
				</footer>
			</main>
		</div>
	);
}
