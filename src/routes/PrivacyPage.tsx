// src/routes/PrivacyPage.tsx

import {
	ArrowRight,
	ExternalLink,
	Eye,
	Lock,
	Mail,
	Server,
	Shield,
	Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { APP_NAME } from "@/appMeta";
import { cn } from "@/lib/utils";
import AuthShell from "../auth/AuthShell";
import { Badge } from "../components/primitives/Badge";
import { Button } from "../components/primitives/Button";
import { Panel } from "../components/primitives/Panel";
import { HStack, Stack } from "../components/primitives/Stack";
// Primitives
import { Heading, Text } from "../components/primitives/Text";
import styles from "./PrivacyPage.module.css";

const APP_SLUG = APP_NAME.toLowerCase().replace(/\s+/g, "");

// ═══════════════════════════════════════════════════════════════════════════
// DATA SECTIONS
// ═══════════════════════════════════════════════════════════════════════════
const sections = [
	{
		icon: Eye,
		title: "What we collect",
		color: "primary" as const,
		items: [
			"Account information (email, auth identifiers)",
			"Product usage events (to improve the product)",
			"Optional billing data (if/when enabled)",
		],
	},
	{
		icon: Lock,
		title: "How we protect it",
		color: "success" as const,
		items: [
			"All data encrypted in transit and at rest",
			"Passwordless authentication (passkeys + magic links)",
			"Regular security audits and monitoring",
		],
	},
	{
		icon: Server,
		title: "How we use it",
		color: "accent" as const,
		items: [
			"Provide and secure the service",
			"Improve reliability, performance, and UX",
			"Support and debugging (when needed)",
		],
	},
	{
		icon: Trash2,
		title: "Your rights",
		color: "warning" as const,
		items: [
			"Request a copy of your data anytime",
			"Delete your account and all associated data",
			"Opt out of non-essential data collection",
		],
	},
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function PrivacyPage() {
	const sectionToneClass = {
		primary: styles.sectionIconPrimary,
		success: styles.sectionIconSuccess,
		accent: styles.sectionIconAccent,
		warning: styles.sectionIconWarning,
	} as const;

	return (
		<AuthShell navLink={{ to: "/", label: "Back to landing" }} hidePanel>
			<Stack gap={8}>
				{/* ─────────────────────────────────────────────────────────────────
            HEADER
        ───────────────────────────────────────────────────────────────── */}
				<div>
					<HStack gap={2} align="center" className={styles.headerTop}>
						<div className={styles.shieldIcon}>
							<Shield size={16} />
						</div>
						<Badge color="primary" variant="soft">
							Privacy Policy
						</Badge>
					</HStack>

					<Heading level={1} className={styles.heading}>
						Your data, your control
					</Heading>

					<Text color="muted" size="md" className={styles.introCopy} block>
						We believe in transparency. Here's exactly what we collect, why we
						collect it, and how we protect it.
					</Text>

					<Text size="xs" color="muted" className={styles.updatedNote} block>
						Last updated: March 2025 · This is a living document.
					</Text>
				</div>

				{/* ─────────────────────────────────────────────────────────────────
            SECTIONS GRID
        ───────────────────────────────────────────────────────────────── */}
				<div className={styles.sectionsGrid}>
					{sections.map((section) => {
						const Icon = section.icon;
						return (
							<Panel key={section.title} variant="default" padding="md" hover>
								<Stack gap={3}>
									{/* Section header */}
									<HStack gap={3} align="start" className={styles.sectionHead}>
										<div
											className={cn(
												styles.sectionIcon,
												sectionToneClass[section.color],
											)}
										>
											<Icon size={18} />
										</div>
										<Text
											size="sm"
											weight="semibold"
											className={styles.sectionTitle}
										>
											{section.title}
										</Text>
									</HStack>

									{/* Items */}
									<Stack gap={2} className={styles.sectionItems}>
										{section.items.map((item, i) => (
											<HStack key={i} gap={2} align="start">
												<span className={styles.bulletDot} />
												<Text size="sm" color="muted">
													{item}
												</Text>
											</HStack>
										))}
									</Stack>
								</Stack>
							</Panel>
						);
					})}
				</div>

				{/* ─────────────────────────────────────────────────────────────────
            CONTACT SECTION
        ───────────────────────────────────────────────────────────────── */}
				<Panel variant="outline" padding="lg">
					<HStack gap={4} align="start" wrap className={styles.contactWrap}>
						<div className={styles.contactIcon}>
							<Mail size={20} />
						</div>
						<Stack gap={1} className={styles.contactBody}>
							<Text weight="semibold">Questions or concerns?</Text>
							<Text size="sm" color="muted">
								We're happy to help. Reach out and we'll respond within 48
								hours.
							</Text>
							<Text
								size="sm"
								weight="medium"
								color="primary"
								className={styles.contactEmail}
							>
								{`privacy@${APP_SLUG}.app`}
							</Text>
						</Stack>
					</HStack>
				</Panel>

				{/* ─────────────────────────────────────────────────────────────────
            CTA SECTION
        ───────────────────────────────────────────────────────────────── */}
				<Panel variant="default" padding="lg" className={styles.ctaPanel}>
					{/* Background accent */}
					<div className={styles.ctaAccent} />

					<Stack gap={4} className={styles.ctaContent}>
						<div>
							<Text size="lg" weight="semibold" block>
								Ready to get started?
							</Text>
							<Text size="sm" color="muted" block>
								Create your account and explore the workspace.
							</Text>
						</div>

						<HStack gap={3} wrap>
							<Link to="/signup">
								<Button variant="primary" iconRight={<ArrowRight size={16} />}>
									Create account
								</Button>
							</Link>
							<Link to="/login">
								<Button variant="secondary">Sign in</Button>
							</Link>
						</HStack>
					</Stack>
				</Panel>

				{/* ─────────────────────────────────────────────────────────────────
            FOOTER LINKS
        ───────────────────────────────────────────────────────────────── */}
				<HStack gap={4} justify="center" className={styles.footerLinks}>
					<Link to="/roadmap" className={styles.footerLink}>
						Roadmap
						<ExternalLink size={10} />
					</Link>
					<span className={styles.footerDivider}>·</span>
					<Link to="/" className={styles.footerLink}>
						Home
						<ExternalLink size={10} />
					</Link>
				</HStack>
			</Stack>
		</AuthShell>
	);
}
