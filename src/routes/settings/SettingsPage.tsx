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
					<div className="settings-panel">
						<h3 className="settings-h3">
							AI Configuration
							<span className="settings-h3-sub">
								Provider selection and prompts.
							</span>
						</h3>
						<div className="glass settings-card">
							<div className="settings-card-head">
								<Bot size={16} />
								<div>
									<div className="settings-card-title">Coming Soon</div>
									<div className="settings-card-sub">
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
						className="glass rounded-2xl border border-white/8 p-3"
						aria-label="Settings sections"
					>
						<div className="mb-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
							<div className="text-xs uppercase tracking-wide text-white/50">
								Workspace profile
							</div>
							<div className="mt-1 text-sm font-semibold text-white/90">
								Settings coverage
							</div>
							<div className="mt-2 text-xs text-white/60">
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
												? "border-[rgba(232,201,126,0.35)] bg-[rgba(232,201,126,0.12)]"
												: "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]",
										)}
									>
										<div className="flex items-center gap-2 text-sm font-medium text-white/90">
											<Icon size={15} />
											<span>{tab.label}</span>
										</div>
										<div className="mt-1 text-xs text-white/60">
											{tab.description}
										</div>
									</button>
								);
							})}
						</nav>
					</aside>

					<section className="space-y-3">
						<div className="glass rounded-2xl border border-white/8 p-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<div className="text-xs uppercase tracking-wide text-white/50">
										Current section
									</div>
									<div className="mt-1 text-lg font-semibold text-white/90">
										{activeMeta.label}
									</div>
									<p className="mt-1 text-sm text-white/60">
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
														? "border-[rgba(232,201,126,0.35)] bg-[rgba(232,201,126,0.12)] text-white"
														: "border-white/15 text-white/70 hover:bg-white/[0.04]",
												)}
											>
												{tab.label}
											</button>
										);
									})}
								</div>
							</div>
						</div>

						<div className="settings-content">{Active}</div>
					</section>
				</div>
			</FrameSection>
		</PageFrame>
	);
}
