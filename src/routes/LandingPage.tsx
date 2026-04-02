// src/routes/LandingPage.tsx

import {
	Activity,
	Boxes,
	ClipboardList,
	Sparkles,
	Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { APP_TAGLINE } from "../appMeta";
import { SuiteLogo } from "../components/brand/SuiteLogo";
import { Badge } from "../components/primitives/Badge";
import { Button } from "../components/primitives/Button";
import { Panel } from "../components/primitives/Panel";
import { HStack } from "../components/primitives/Stack";
import { Text } from "../components/primitives/Text";
import styles from "./LandingPage.module.css";

const COMMAND_SIGNALS = [
	{
		icon: Activity,
		label: "Watchdog visibility",
		value: "Tracked drawing activity, workstation coverage, and recent delivery movement",
	},
	{
		icon: Workflow,
		label: "Delivery flow",
		value: "Projects, review pressure, issue sets, and transmittals stay tied together",
	},
	{
		icon: ClipboardList,
		label: "Review control",
		value: "Blockers, issue prep, and release evidence stay attached to the same project story",
	},
] as const;

const HERO_SUMMARY_ITEMS = [
	{
		icon: ClipboardList,
		label: "Delivery scope",
		value:
			"Projects, revisions, transmittals, and review checkpoints stay in one workflow.",
	},
	{
		icon: Boxes,
		label: "Drawing control",
		value:
			"Drawing lists, standards checker, and package prep stay tied to the same project workflow.",
	},
	{
		icon: Activity,
		label: "Tracked activity",
		value:
			"Watchdog keeps drawing work visible without pushing raw collector noise into the product view.",
	},
	{
		icon: Workflow,
		label: "Issue control",
		value:
			"Issue sets, review checkpoints, and delivery receipts stay attached to the same project story.",
	},
] as const;

const PRODUCT_SURFACES = [
	{
		icon: ClipboardList,
		label: "Issue readiness",
		value:
			"Package blockers, review decisions, and transmittal prep stay in one delivery flow.",
	},
	{
		icon: Activity,
		label: "Watchdog telemetry",
		value:
			"See which drawings were opened, saved, and tracked without living in raw collector noise.",
	},
	{
		icon: Boxes,
		label: "Drawing control",
		value:
			"Drawing lists, standards, title-block review, and package assembly stay tied to the project.",
	},
	{
		icon: Sparkles,
		label: "Workflow support",
		value:
			"Reference tools and automation support the delivery path without taking over the main workspace story.",
	},
] as const;

export default function LandingPage() {
	const { user } = useAuth();

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
							Sign in
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
								className={`${styles.sectionBadge} ${styles.heroBadge}`}
							>
								<span className={styles.sectionBadgeDot} />
								Engineering ops
							</Badge>

							<h1 className={styles.heroTitle}>
								One control surface for{" "}
								<span className={styles.heroHighlight}>
									project delivery and drawing control.
								</span>
							</h1>

							<Text color="muted" size="md" className={styles.heroCopy}>
								{APP_TAGLINE}. Coordinate project readiness, Watchdog telemetry,
								and issue packages without bouncing between disconnected
								document, drawing, and runtime tools.
							</Text>

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
									<Text
										size="xs"
										weight="semibold"
										className={styles.heroSummaryEyebrow}
									>
										Drawing production control
									</Text>
									<Text as="h2" size="lg" weight="semibold" block>
										One workspace for delivery, telemetry, and issue control
									</Text>
								<Text size="sm" color="muted" block>
									The same surface keeps package readiness, drawing activity,
									and transmittal prep connected in one delivery workspace.
								</Text>
								</div>
								<div className={styles.heroRailFlow}>
									<div className={styles.heroSupportList}>
										{COMMAND_SIGNALS.map((signal) => (
											<div
												key={signal.label}
												className={styles.heroSupportItem}
											>
												<signal.icon className={styles.heroSupportIcon} />
												<div className={styles.heroSupportContent}>
													<Text
														size="xs"
														weight="semibold"
														className={styles.heroSupportLabel}
														block
													>
														{signal.label}
													</Text>
													<Text
														size="xs"
														color="muted"
														className={styles.heroSupportValue}
														block
													>
														{signal.value}
													</Text>
												</div>
											</div>
										))}
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
								</div>
							</Panel>
						</div>
					</div>
				</section>

				<section className={styles.agentsSection}>
					<Panel variant="default" padding="lg" className={styles.agentsPanel}>
						<div className={styles.agentsHeader}>
							<Badge
								color="default"
								variant="outline"
								className={`${styles.sectionBadge} ${styles.agentsBadge}`}
							>
								<span className={styles.sectionBadgeDot} />
								Product surfaces
							</Badge>

							<Text as="h2" size="xl" weight="semibold" block>
								Four workflow pillars behind the product
							</Text>
							<Text color="muted" size="sm" className={styles.agentsCopy} block>
								Suite stays focused on drawing delivery, review control, and
								tracked project activity instead of scattering the work across
								disconnected tools.
							</Text>
						</div>

						<div className={styles.agentGrid}>
							{PRODUCT_SURFACES.map((surface) => {
								const Icon = surface.icon;
								return (
									<div key={surface.label} className={styles.agentCard}>
										<div className={styles.agentMark}>
											<Icon className={styles.heroSupportIcon} />
										</div>
										<div className={styles.agentCardCopy}>
											<Text size="sm" weight="semibold" block>
												{surface.label}
											</Text>
											<Text
												size="xs"
												color="muted"
												className={styles.agentTagline}
												block
											>
												{surface.value}
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
