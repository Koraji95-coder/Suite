// src/routes/app/settings/SettingsPage.tsx
import {
	Bot,
	Mail,
	Palette,
	Settings as SettingsIcon,
	Shield,
	User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import { cn } from "@/lib/utils";

import AccountSettings from "./AccountSettings";
import EmailConfig from "./EmailConfig";
import ProfileSettings from "./ProfileSettings";
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
		id: "profile",
		label: "Profile",
		description: "Identity and account contact details.",
		icon: User,
	},
	{
		id: "email",
		label: "Email",
		description: "SMTP defaults, templates, and notifications.",
		icon: Mail,
	},
	{
		id: "account",
		label: "Account",
		description: "Password, sessions, and account actions.",
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
	const stored = localStorage.getItem(STORAGE_KEY) as TabId | null;
	return stored && TABS.some((t) => t.id === stored) ? stored : "theme";
}

export default function SettingsPage() {
	const [activeTab, setActiveTab] = useState<TabId>(() => getInitialTab());

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, activeTab);
	}, [activeTab]);

	const Active = useMemo(() => {
		switch (activeTab) {
			case "theme":
				return <ThemePicker />;
			case "profile":
				return <ProfileSettings />;
			case "email":
				return <EmailConfig />;
			case "account":
				return <AccountSettings />;
			case "ai":
				return (
					<div className="grid gap-3">
						<h3 className="text-lg font-semibold tracking-tight [color:var(--text)]">
							AI Configuration
							<span className="ml-2 text-sm font-normal [color:var(--text-muted)]">
								Provider selection and prompts.
							</span>
						</h3>
						<div className="grid gap-3 rounded-2xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
							<div className="flex items-start gap-2">
								<Bot size={16} />
								<div>
									<div className="text-sm font-semibold [color:var(--text)]">
										Coming Soon
									</div>
									<div className="text-xs [color:var(--text-muted)]">
										Model selection, temperature, and system prompts will live
										here.
									</div>
								</div>
							</div>
						</div>
					</div>
				);
			default:
				return null;
		}
	}, [activeTab]);

	const activeMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
	const completedAreas = 4;
	const totalAreas = TABS.length;

	return (
		<PageFrame
			title="Settings"
			subtitle="Customize your workspace, account, and operational preferences."
			icon={<SettingsIcon size={18} />}
		>
			<FrameSection title="Control Center">
				<div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
					<aside
						className="rounded-2xl border p-3 [border-color:var(--border)] [background:var(--bg-mid)]"
						aria-label="Settings sections"
					>
						<div className="mb-3 rounded-xl border p-3 [border-color:var(--border)] [background:var(--surface-2)]">
							<div className="text-xs uppercase tracking-wide [color:var(--text-muted)]">
								Workspace profile
							</div>
							<div className="mt-1 text-sm font-semibold [color:var(--text)]">
								Settings coverage
							</div>
							<div className="mt-2 text-xs [color:var(--text-muted)]">
								{completedAreas}/{totalAreas} areas configured
							</div>
						</div>

						<nav className="space-y-1">
							{TABS.map((tab) => {
								const Icon = tab.icon;
								const isActive = tab.id === activeTab;

								return (
									<button
										key={tab.id}
										type="button"
										onClick={() => setActiveTab(tab.id)}
										className={cn(
											"w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
											isActive
												? "[border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_16%,var(--surface))]"
												: "[border-color:var(--border)] [background:var(--surface)] hover:[background:var(--surface-2)]",
										)}
									>
										<div className="flex items-center gap-2 text-sm font-medium [color:var(--text)]">
											<Icon size={15} />
											<span>{tab.label}</span>
										</div>
										<div className="mt-1 text-xs [color:var(--text-muted)]">
											{tab.description}
										</div>
									</button>
								);
							})}
						</nav>
					</aside>

					<section className="space-y-3">
						<div className="rounded-2xl border p-4 [border-color:var(--border)] [background:var(--bg-mid)]">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<div className="text-xs uppercase tracking-wide [color:var(--text-muted)]">
										Current section
									</div>
									<div className="mt-1 text-lg font-semibold [color:var(--text)]">
										{activeMeta.label}
									</div>
									<p className="mt-1 text-sm [color:var(--text-muted)]">
										{activeMeta.description}
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									{TABS.map((tab) => {
										const isActive = tab.id === activeTab;
										return (
											<button
												key={tab.id}
												type="button"
												onClick={() => setActiveTab(tab.id)}
												className={cn(
													"rounded-full border px-3 py-1 text-xs",
													isActive
														? "[border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_16%,var(--surface))] [color:var(--text)]"
														: "[border-color:var(--border)] [color:var(--text-muted)] hover:[background:var(--surface-2)]",
												)}
											>
												{tab.label}
											</button>
										);
									})}
								</div>
							</div>
						</div>

						<div>{Active}</div>
					</section>
				</div>
			</FrameSection>
		</PageFrame>
	);
}
