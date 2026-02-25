// src/routes/AppShell.tsx
import {
	AppWindow,
	BookOpen,
	CalendarDays,
	FolderOpen,
	LayoutDashboard,
	Network,
	Settings,
	Sparkles,
	TerminalSquare,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import {
	PageHeaderProvider,
	usePageHeader,
} from "../components/apps/ui/PageHeaderContext";
import { isDevAdminEmail } from "../lib/devAccess";

const primaryNavItems = [
	{ to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/app/projects", label: "Projects", icon: FolderOpen },
	{ to: "/app/calendar", label: "Calendar", icon: CalendarDays },
	{ to: "/app/apps", label: "Apps", icon: AppWindow },
	{ to: "/app/knowledge", label: "Knowledge", icon: BookOpen },
	{ to: "/app/agent", label: "Agent", icon: Sparkles },
	{ to: "/app/architecture-map", label: "Architecture", icon: Network },
];

function AppTopbar() {
	const { signOut, user, profile } = useAuth();
	const { header } = usePageHeader();
	const [localTime, setLocalTime] = useState(() => new Date());

	useEffect(() => {
		const timer = window.setInterval(() => {
			setLocalTime(new Date());
		}, 1000);

		return () => {
			window.clearInterval(timer);
		};
	}, []);

	const displayLabel = useMemo(() => {
		const name = profile?.display_name?.trim();
		if (name) return name;
		const metadataName =
			typeof user?.user_metadata?.display_name === "string"
				? user.user_metadata.display_name.trim()
				: typeof user?.user_metadata?.full_name === "string"
					? user.user_metadata.full_name.trim()
					: "";
		if (metadataName) return metadataName;
		return user?.email ?? "Signed in";
	}, [profile?.display_name, user?.email, user?.user_metadata]);

	const timeLabel = useMemo(
		() =>
			localTime.toLocaleTimeString([], {
				hour: "numeric",
				minute: "2-digit",
				second: "2-digit",
			}),
		[localTime],
	);

	return (
		<div className="app-topbar glass">
			<div className="app-topbar-inner">
				<NavLink
					to="/app/dashboard"
					className="nav-logo"
					aria-label="Go to dashboard"
				>
					<div className="nav-logo-mark">
						<span />
						<span />
						<span />
						<span />
					</div>
					<span className="nav-logo-name">BlockFlow</span>
				</NavLink>

				<div className="app-topbar-center">
					{header.centerContent ? (
						header.centerContent
					) : header.title || header.subtitle || header.icon ? (
						<div className="app-topbar-center-inner">
							<div className="app-topbar-title-row">
								{header.icon ? (
									<span className="app-topbar-title-icon">
										{header.icon}
									</span>
								) : null}
								{header.title ? (
									<span className="app-topbar-title">{header.title}</span>
								) : null}
							</div>
							{header.subtitle ? (
								<span className="app-topbar-subtitle">
									{header.subtitle}
								</span>
							) : null}
						</div>
					) : null}
				</div>

				<div className="app-actions">
					<span className="app-time-chip" aria-label="Local time">
						{timeLabel}
					</span>
					<span className="app-user-chip">{displayLabel}</span>
					<button
						type="button"
						className="btn-ghost"
						onClick={() => void signOut()}
					>
						Sign out
					</button>
				</div>
			</div>
		</div>
	);
}

function FirstLoginNamePrompt() {
	const { user, profile, updateProfile } = useAuth();
	const [value, setValue] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const currentName =
		profile?.display_name?.trim() ||
		(typeof user?.user_metadata?.display_name === "string"
			? user.user_metadata.display_name.trim()
			: "");
	const shouldShow = Boolean(user && !currentName);

	if (!shouldShow) return null;

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		const trimmed = value.trim();
		if (!trimmed || saving) return;

		setSaving(true);
		setError("");
		try {
			await updateProfile({ display_name: trimmed });
		} catch {
			setError("Could not save your name yet. Please try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 1200,
				background: "var(--bg-heavy)",
				backdropFilter: "blur(6px) saturate(110%)",
				WebkitBackdropFilter: "blur(6px) saturate(110%)",
				display: "grid",
				placeItems: "center",
				padding: "24px",
			}}
		>
			<form
				onSubmit={(event) => void submit(event)}
				className="glass"
				style={{
					width: "min(520px, 100%)",
					borderRadius: "20px",
					padding: "24px",
					display: "grid",
					gap: "12px",
					border: "1px solid var(--border)",
					background: "var(--bg-mid)",
				}}
			>
				<h2 style={{ margin: 0, fontSize: "30px", fontFamily: "var(--serif)" }}>
					Thanks for signing up!
				</h2>
				<p style={{ margin: 0, color: "var(--white-dim)", fontSize: "14px" }}>
					What should we call you?
				</p>

				<input
					type="text"
					className="auth-input"
					placeholder="Enter your name"
					value={value}
					onChange={(event) => setValue(event.target.value)}
					autoFocus
					maxLength={64}
					required
				/>

				{error ? <div className="auth-error">{error}</div> : null}

				<div
					style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
				>
					<button
						type="submit"
						className="btn-primary"
						disabled={saving || value.trim().length < 2}
					>
						{saving ? "Saving…" : "Continue"}
					</button>
				</div>
			</form>
		</div>
	);
}

function AppSidebar() {
	const { user } = useAuth();
	const canAccessCommandCenter = isDevAdminEmail(user?.email);
	const navRef = useRef<HTMLElement | null>(null);
	const safeNavItems = primaryNavItems.filter(
		(item) => item.to.trim().length > 0 && item.label.trim().length > 0,
	);

	useEffect(() => {
		const navNode = navRef.current;
		if (!navNode) return;

		for (const child of Array.from(navNode.children)) {
			const text = child.textContent?.trim() ?? "";
			const hasIcon = Boolean(child.querySelector("svg"));
			if (!text && !hasIcon) {
				child.remove();
			}
		}
	}, []);

	return (
		<aside className="app-sidebar glass" aria-label="Workspace navigation">
			<nav ref={navRef} className="app-sidebar-nav">
				{safeNavItems.map((item) => {
					const Icon = item.icon;
					return (
						<NavLink
							key={item.to}
							to={item.to}
							className={({ isActive }) =>
								`app-sidebar-link ${isActive ? "active" : ""}`
							}
						>
							<Icon size={16} />
							<span>{item.label}</span>
						</NavLink>
					);
				})}

				<NavLink
					to="/app/settings"
					className={({ isActive }) =>
						`app-sidebar-link ${isActive ? "active" : ""}`
					}
				>
					<Settings size={16} />
					<span>Settings</span>
				</NavLink>

				{canAccessCommandCenter ? (
					<NavLink
						to="/app/command-center"
						className={({ isActive }) =>
							`app-sidebar-link ${isActive ? "active" : ""}`
						}
					>
						<TerminalSquare size={16} />
						<span>Command Center</span>
					</NavLink>
				) : null}
			</nav>
		</aside>
	);
}

export default function AppShell() {
	return (
		<PageHeaderProvider>
			<div className="app-shell">
				<AppTopbar />
				<FirstLoginNamePrompt />
				<div className="app-shell-grid">
					<AppSidebar />
					<div className="app-shell-body">
						<Outlet />
					</div>
				</div>
			</div>
		</PageHeaderProvider>
	);
}
