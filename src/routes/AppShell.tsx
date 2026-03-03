import {
	AppWindow,
	BookOpen,
	CalendarDays,
	FolderOpen,
	KeyRound,
	LayoutDashboard,
	Menu,
	Network,
	Settings,
	Sparkles,
	TerminalSquare,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import {
	PageHeaderProvider,
	usePageHeader,
} from "../components/apps/ui/PageHeaderContext";
import { APP_NAME } from "../appMeta";
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

function AppTopbar({ onMenuToggle }: { onMenuToggle: () => void }) {
	const { signOut, user, profile, sessionAuthMethod } = useAuth();
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

	const passkeySessionActive = sessionAuthMethod === "passkey";

	return (
		<header className="flex-none border-b border-border [background:color-mix(in_srgb,var(--bg-base)_86%,transparent)] backdrop-blur" style={{ zIndex: "var(--z-topbar)" }}>
			<div className="flex w-full items-center justify-between gap-4 px-4 py-3 md:px-6">
				<button
					type="button"
					className="inline-flex items-center justify-center rounded-xl border border-border bg-surface p-2 text-text transition hover:bg-surface-2 md:hidden"
					onClick={onMenuToggle}
					aria-label="Toggle navigation menu"
				>
					<Menu size={18} />
				</button>

				<div className="hidden flex-1 justify-start px-1 md:flex">
					{header.centerContent ? (
						header.centerContent
					) : header.title || header.subtitle || header.icon ? (
						<div className="grid gap-0.5">
							<div className="inline-flex items-center gap-2">
								{header.icon ? (
									<span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-text">
										{header.icon}
									</span>
								) : null}
								{header.title ? (
									<span className="text-sm font-semibold text-text">
										{header.title}
									</span>
								) : null}
							</div>
							{header.subtitle ? (
								<span className="text-xs text-text-muted">{header.subtitle}</span>
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
					{passkeySessionActive ? (
						<span className="hidden items-center gap-1 rounded-lg border px-2.5 py-1 text-xs sm:inline-flex [border-color:color-mix(in_oklab,var(--primary)_40%,var(--border))] [background:color-mix(in_oklab,var(--primary)_12%,var(--surface))] [color:var(--primary)]">
							<KeyRound size={12} />
							Passkey session
						</span>
					) : null}
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
		</header>
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
		<div className="fixed inset-0 grid place-items-center bg-bg-heavy p-6 backdrop-blur" style={{ zIndex: "var(--z-critical-modal)" }}>
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
						{saving ? "Saving\u2026" : "Continue"}
					</button>
				</div>
			</form>
		</div>
	);
}

const navItemClass = (isActive: boolean) =>
	[
		"flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition",
		isActive
			? "bg-surface text-text"
			: "text-text-muted hover:bg-surface-2 hover:text-text",
	].join(" ");

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
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

	return (
		<nav ref={navRef} className="grid gap-0.5">
			{safeNavItems.map((item) => {
				const Icon = item.icon;
				return (
					<NavLink
						key={item.to}
						to={item.to}
						className={({ isActive }) => navItemClass(isActive)}
						onClick={onNavigate}
					>
						<Icon size={16} />
						<span>{item.label}</span>
					</NavLink>
				);
			})}

			<NavLink
				to="/app/settings"
				className={({ isActive }) => navItemClass(isActive)}
				onClick={onNavigate}
			>
				<Settings size={16} />
				<span>Settings</span>
			</NavLink>

			{canAccessCommandCenter ? (
				<NavLink
					to="/app/command-center"
					className={({ isActive }) => navItemClass(isActive)}
					onClick={onNavigate}
				>
					<TerminalSquare size={16} />
					<span>Command Center</span>
				</NavLink>
			) : null}
		</nav>
	);
}

function SidebarBrand() {
	return (
		<NavLink
			to="/app/dashboard"
			className="inline-flex items-center gap-3 px-3 py-1 no-underline"
			aria-label="Go to dashboard"
		>
			<div className="grid h-9 w-9 grid-cols-2 gap-0.5 rounded-[14px] border border-border bg-surface p-1">
				<span className="rounded-[4px] bg-primary" />
				<span className="rounded-[4px] bg-accent" />
				<span className="rounded-[4px] [background:color-mix(in_oklab,var(--text)_70%,transparent)]" />
				<span className="rounded-[4px] bg-primary" />
			</div>
			<span className="text-lg font-semibold leading-none tracking-tight text-text">
				{APP_NAME}
			</span>
		</NavLink>
	);
}

function DesktopSidebar() {
	return (
		<aside
			className="hidden md:flex flex-col w-[220px] flex-none border-r border-border bg-bg-base"
			aria-label="Workspace navigation"
			style={{ zIndex: "var(--z-sidebar)" }}
		>
			<div className="flex-none px-3 py-4">
				<SidebarBrand />
			</div>
			<div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
				<SidebarNav />
			</div>
		</aside>
	);
}

function MobileDrawer({
	open,
	onClose,
}: { open: boolean; onClose: () => void }) {
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 md:hidden" style={{ zIndex: "var(--z-sheet)" }}>
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>
			<aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col border-r border-border bg-bg-base shadow-2xl">
				<div className="flex items-center justify-between px-4 py-4">
					<SidebarBrand />
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-2 hover:text-text"
						aria-label="Close menu"
					>
						<X size={18} />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
					<SidebarNav onNavigate={onClose} />
				</div>
			</aside>
		</div>
	);
}

export default function AppShell() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const { pathname } = useLocation();

	const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: 0 });
	}, [pathname]);

	return (
		<PageHeaderProvider>
			<div className="flex h-dvh flex-col overflow-hidden bg-bg-base text-text">
				<AppTopbar onMenuToggle={() => setMobileMenuOpen((p) => !p)} />
				<FirstLoginNamePrompt />
				<MobileDrawer open={mobileMenuOpen} onClose={closeMobileMenu} />

				<div className="flex flex-1 overflow-hidden">
					<DesktopSidebar />
					<main
						ref={scrollRef}
						className="flex-1 overflow-y-auto overscroll-contain scroll-smooth p-3 md:p-5"
					>
						<Outlet />
					</main>
				</div>
			</div>
		</PageHeaderProvider>
	);
}
