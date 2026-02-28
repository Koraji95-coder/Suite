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
import { APP_NAME } from "../app";
import { isDevAdminEmail } from "../lib/devAccess";

const primaryNavItems = [
	{ to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/app/projects", label: "Projects", icon: FolderOpen },
	{ to: "/app/calendar", label: "Calendar", icon: CalendarDays },
	{ to: "/app/apps", label: "Apps", icon: AppWindow },
	{ to: "/app/knowledge", label: "Knowledge", icon: BookOpen },
	{ to: "/app/agent", label: "Koro Agent", icon: Sparkles },
	{ to: "/app/architecture-map", label: "Architecture", icon: Network },
];

function AppTopbar() {
	const { signOut, user, profile } = useAuth();
	const { header } = usePageHeader();
	const [localTime, setLocalTime] = useState(() => new Date());

	useEffect(() => {
		const timer = window.setInterval(() => setLocalTime(new Date()), 1000);
		return () => window.clearInterval(timer);
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
		<div className="sticky top-0 z-40 border-b border-border [background:color-mix(in_srgb,var(--bg-base)_86%,transparent)] backdrop-blur">
			<div className="flex w-full items-center justify-between gap-4 px-6 py-5 md:px-8">
				<NavLink
					to="/app/dashboard"
					className="inline-flex items-center gap-4 no-underline"
					aria-label="Go to dashboard"
				>
					<div className="grid h-12 w-12 grid-cols-2 gap-1 rounded-[20px] border border-border bg-surface p-1">
						<span className="rounded-md bg-primary" />
						<span className="rounded-md bg-accent" />
						<span className="rounded-md [background:color-mix(in_oklab,var(--text)_70%,transparent)]" />
						<span className="rounded-md bg-primary" />
					</div>

					<span className="text-[26px] font-semibold leading-none tracking-tight text-text">
						{APP_NAME}
					</span>
				</NavLink>

				<div className="hidden flex-1 justify-center px-3 md:flex">
					{header.centerContent ? (
						header.centerContent
					) : header.title || header.subtitle || header.icon ? (
						<div className="grid gap-1 text-center">
							<div className="inline-flex items-center justify-center gap-2">
								{header.icon ? (
									<span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface-2 text-text">
										{header.icon}
									</span>
								) : null}
								{header.title ? (
									<span className="text-base font-semibold text-text">
										{header.title}
									</span>
								) : null}
							</div>
							{header.subtitle ? (
								<span className="text-sm text-text-muted">{header.subtitle}</span>
							) : null}
						</div>
					) : null}
				</div>

				<div className="flex items-center gap-2">
					<span
						className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-text-muted"
						aria-label="Local time"
					>
						{timeLabel}
					</span>
					<span className="hidden rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-text sm:inline-flex">
						{displayLabel}
					</span>
					<button
						type="button"
						className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-surface-2"
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
		<div className="fixed inset-0 z-[1200] grid place-items-center bg-bg-heavy p-6 backdrop-blur">
			<form
				onSubmit={(event) => void submit(event)}
				className="grid w-full max-w-[520px] gap-3 rounded-2xl border border-border bg-bg-mid p-6"
			>
				<h2 className="m-0 text-3xl font-semibold tracking-tight text-text">
					Thanks for signing up!
				</h2>
				<p className="m-0 text-sm text-text-muted">What should we call you?</p>

				<input
					type="text"
					className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-primary"
					placeholder="Enter your name"
					value={value}
					onChange={(event) => setValue(event.target.value)}
					autoFocus
					maxLength={64}
					required
				/>

				{error ? (
					<div className="rounded-xl border border-danger bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] px-3 py-2 text-sm text-danger">
						{error}
					</div>
				) : null}

				<div className="flex justify-end gap-2.5">
					<button
						type="submit"
						className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-contrast transition disabled:cursor-not-allowed disabled:opacity-60"
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
			if (!text && !hasIcon) child.remove();
		}
	}, []);

	const navItemClass = (isActive: boolean) =>
		[
			"flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
			isActive
				? "bg-surface text-text"
				: "text-text-muted hover:bg-surface-2 hover:text-text",
		].join(" ");

	return (
		<aside
			className="rounded-2xl border border-border bg-bg-mid p-2"
			aria-label="Workspace navigation"
		>
			<nav ref={navRef} className="grid gap-1">
				{safeNavItems.map((item) => {
					const Icon = item.icon;
					return (
						<NavLink
							key={item.to}
							to={item.to}
							className={({ isActive }) => navItemClass(isActive)}
						>
							<Icon size={16} />
							<span>{item.label}</span>
						</NavLink>
					);
				})}

				<NavLink
					to="/app/settings"
					className={({ isActive }) => navItemClass(isActive)}
				>
					<Settings size={16} />
					<span>Settings</span>
				</NavLink>

				{canAccessCommandCenter ? (
					<NavLink
						to="/app/command-center"
						className={({ isActive }) => navItemClass(isActive)}
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
			<div className="min-h-screen bg-bg-base text-text">
				<AppTopbar />
				<FirstLoginNamePrompt />

				<div className="grid w-full gap-4 px-4 py-4 md:grid-cols-[240px_minmax(0,1fr)] md:px-6 md:py-6">
					<AppSidebar />
					<div className="min-w-0">
						<div className="mx-auto w-full max-w-[1600px]">
							<Outlet />
						</div>
					</div>
				</div>
			</div>
		</PageHeaderProvider>
	);
}
