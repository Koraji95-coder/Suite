// src/routes/app/settings/SettingsPage.tsx
import { Bot, Mail, Palette, Settings as SettingsIcon, Shield, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import AccountSettings from "./AccountSettings";
import EmailConfig from "./EmailConfig";
import ProfileSettings from "./ProfileSettings";
import ThemePicker from "./ThemePicker";

const STORAGE_KEY = "app-settings-active-tab";

const TABS = [
	{ id: "theme", label: "Theme", icon: Palette },
	{ id: "profile", label: "Profile", icon: User },
	{ id: "email", label: "Email", icon: Mail },
	{ id: "account", label: "Account", icon: Shield },
	{ id: "ai", label: "AI Config", icon: Bot },
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
							<span className="settings-h3-sub">Provider selection and prompts.</span>
						</h3>
						<div className="glass settings-card">
							<div className="settings-card-head">
								<Bot size={16} />
								<div>
									<div className="settings-card-title">Coming Soon</div>
									<div className="settings-card-sub">
										Model selection, temperature, and system prompts will live here.
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

	return (
		<div className="settings-page">
			<div className="settings-header glass">
				<div className="settings-header-left">
					<SettingsIcon size={18} />
					<h2 className="settings-title">Settings</h2>
				</div>
				<div className="settings-header-right">
					<span className="settings-hint">Manage appearance, profile, and account security.</span>
				</div>
			</div>

			<div className="settings-body">
				<aside className="settings-sidebar glass" aria-label="Settings tabs">
					{TABS.map((t) => {
						const Icon = t.icon;
						const isActive = t.id === activeTab;
						return (
							<button
								key={t.id}
								type="button"
								className={`settings-tab ${isActive ? "active" : ""}`}
								onClick={() => setActiveTab(t.id)}
							>
								<Icon size={16} />
								<span>{t.label}</span>
							</button>
						);
					})}
				</aside>

				<section className="settings-content">{Active}</section>
			</div>
		</div>
	);
}