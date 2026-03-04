// src/routes/app/settings/SettingsPage.tsx
import { Bot, Palette, Settings as SettingsIcon, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { Badge } from "@/components/primitives/Badge";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Heading, Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import AccountSettings from "./AccountSettings";
import styles from "./SettingsPage.module.css";
import ThemePicker from "./ThemePicker";

const STORAGE_KEY = "app-settings-active-tab";

const TABS = [
	{
		id: "theme",
		label: "Theme",
		description: "Color system and visual comfort.",
		icon: Palette,
	},
	{
		id: "account",
		label: "Account",
		description: "Profile, passkeys, sessions, and account actions.",
		icon: Shield,
	},
	{
		id: "ai",
		label: "AI Config",
		description: "Model provider and prompt controls.",
		icon: Bot,
	},
] as const;

type TabId = (typeof TABS)[number]["id"];

function getInitialTab(): TabId {
	const storedRaw = localStorage.getItem(STORAGE_KEY) || "";
	const stored =
		storedRaw === "email" || storedRaw === "profile" ? "account" : storedRaw;
	if (stored && TABS.some((tab) => tab.id === stored)) {
		return stored as TabId;
	}
	return "theme";
}

export default function SettingsPage() {
	const [activeTab, setActiveTab] = useState<TabId>(() => getInitialTab());

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, activeTab);
	}, [activeTab]);

	const ActiveContent = useMemo(() => {
		switch (activeTab) {
			case "theme":
				return <ThemePicker />;
			case "account":
				return <AccountSettings />;
			case "ai":
				return <AIConfigPlaceholder />;
			default:
				return null;
		}
	}, [activeTab]);

	const activeMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

	return (
		<PageFrame maxWidth="full">
			<div className={styles.root}>
				<div className={styles.header}>
					<HStack gap={3} align="center" className={styles.headerRow}>
						<div className={styles.headerIcon}>
							<SettingsIcon size={20} />
						</div>
						<div>
							<Heading level={1}>Settings</Heading>
							<Text size="sm" color="muted">
								Customize your workspace, account, and operational preferences.
							</Text>
						</div>
					</HStack>
				</div>

				<div className={styles.layout}>
					<aside aria-label="Settings sections">
						<Panel variant="default" padding="md">
							<Stack gap={4}>
								<div className={styles.coverageCard}>
									<Text
										size="xs"
										color="muted"
										weight="medium"
										className={styles.capsLabel}
									>
										Workspace profile
									</Text>
									<Text
										size="sm"
										weight="semibold"
										className={styles.coverageTitle}
										block
									>
										Settings coverage
									</Text>
									<HStack gap={2} align="center" className={styles.coverageRow}>
										<div className={styles.coverageTrack}>
											<div
												className={styles.coverageFill}
												style={{
													width: `${(TABS.length / TABS.length) * 100}%`,
												}}
											/>
										</div>
										<Text size="xs" color="muted">
											{TABS.length}/{TABS.length}
										</Text>
									</HStack>
								</div>

								<nav>
									<Stack gap={1}>
										{TABS.map((tab) => {
											const Icon = tab.icon;
											const isActive = tab.id === activeTab;

											return (
												<button
													key={tab.id}
													type="button"
													onClick={() => setActiveTab(tab.id)}
													className={cn(
														styles.tabButton,
														isActive
															? styles.tabButtonActive
															: styles.tabButtonInactive,
													)}
												>
													<HStack gap={2} align="center">
														<div
															className={cn(
																styles.tabIcon,
																isActive
																	? styles.tabIconActive
																	: styles.tabIconInactive,
															)}
														>
															<Icon size={14} />
														</div>
														<Stack gap={0} className={styles.tabText}>
															<Text
																size="sm"
																weight="medium"
																color={isActive ? "default" : "muted"}
															>
																{tab.label}
															</Text>
															<Text size="xs" color="muted" truncate>
																{tab.description}
															</Text>
														</Stack>
														{isActive && <div className={styles.activeDot} />}
													</HStack>
												</button>
											);
										})}
									</Stack>
								</nav>
							</Stack>
						</Panel>
					</aside>

					<section>
						<Stack gap={4}>
							<Panel variant="default" padding="md">
								<HStack
									align="center"
									justify="between"
									wrap
									className={styles.sectionHeaderRow}
								>
									<Stack gap={1}>
										<Text
											size="xs"
											color="muted"
											weight="medium"
											className={styles.sectionLabel}
										>
											Current section
										</Text>
										<HStack gap={2} align="center">
											<Text size="lg" weight="semibold">
												{activeMeta.label}
											</Text>
											<Badge color="primary" variant="soft" size="sm">
												Active
											</Badge>
										</HStack>
										<Text size="sm" color="muted">
											{activeMeta.description}
										</Text>
									</Stack>

									<HStack gap={2} wrap className={styles.quickTabs}>
										{TABS.map((tab) => {
											const isActive = tab.id === activeTab;
											return (
												<button
													key={tab.id}
													type="button"
													onClick={() => setActiveTab(tab.id)}
													className={cn(
														styles.quickButton,
														isActive
															? styles.quickButtonActive
															: styles.quickButtonInactive,
													)}
												>
													{tab.label}
												</button>
											);
										})}
									</HStack>
								</HStack>
							</Panel>

							<div>{ActiveContent}</div>
						</Stack>
					</section>
				</div>
			</div>
		</PageFrame>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// AI CONFIG PLACEHOLDER
// ═══════════════════════════════════════════════════════════════════════════
function AIConfigPlaceholder() {
	return (
		<Panel variant="default" padding="lg">
			<Stack gap={4}>
				<HStack gap={3} align="start">
					<div className={styles.aiIcon}>
						<Bot size={20} />
					</div>
					<Stack gap={1}>
						<Text size="lg" weight="semibold">
							AI Configuration
						</Text>
						<Text size="sm" color="muted">
							Provider selection and prompts.
						</Text>
					</Stack>
				</HStack>

				<Panel variant="inset" padding="lg" className={styles.aiInset}>
					<div className={styles.aiInsetCenter}>
						<div className={styles.aiGlyphWrap}>
							<Bot size={28} className={styles.aiGlyph} />
						</div>
						<Text size="md" weight="semibold" block>
							Coming Soon
						</Text>
						<Text size="sm" color="muted" className={styles.aiSubtext} block>
							Model selection, temperature controls, and system prompts will be
							available here.
						</Text>
						<Badge color="info" variant="soft" className={styles.aiBadge}>
							In Development
						</Badge>
					</div>
				</Panel>
			</Stack>
		</Panel>
	);
}
