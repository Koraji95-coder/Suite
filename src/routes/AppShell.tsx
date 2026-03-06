// src/routes/AppShell.tsx
import {
	AppWindow,
	BookOpen,
	CalendarDays,
	FolderOpen,
	KeyRound,
	LayoutDashboard,
	Menu,
	Settings,
	Sparkles,
	TerminalSquare,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { APP_NAME } from "../appMeta";
import { useAuth } from "../auth/useAuth";
import {
	PageHeaderProvider,
	usePageHeader,
} from "../components/apps/ui/PageHeaderContext";
import { Badge } from "../components/primitives/Badge";
import AdminCrownPixel from "../components/roles/AdminCrownPixel";

// Primitives
import { Button } from "../components/primitives/Button";
import { Container } from "../components/primitives/Container";
import { Input } from "../components/primitives/Input";
import { Panel } from "../components/primitives/Panel";
import { HStack, Stack } from "../components/primitives/Stack";
import { Text } from "../components/primitives/Text";
import { isCommandCenterAuthorized } from "../lib/devAccess";
import { getAppRole } from "../lib/roles";
import { cn } from "../lib/utils";
import styles from "./AppShell.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// NAV ITEMS
// ═══════════════════════════════════════════════════════════════════════════
const primaryNavItems = [
	{ to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/app/projects", label: "Projects", icon: FolderOpen },
	{ to: "/app/calendar", label: "Calendar", icon: CalendarDays },
	{ to: "/app/apps", label: "Apps", icon: AppWindow },
	{ to: "/app/knowledge", label: "Knowledge", icon: BookOpen },
	{ to: "/app/agent", label: "Koro Agent", icon: Sparkles },
];

// ═══════════════════════════════════════════════════════════════════════════
// APP TOPBAR
// ═══════════════════════════════════════════════════════════════════════════
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
	const appRole = useMemo(() => getAppRole(user), [user]);
	const isAdmin = appRole === "Admin";

	return (
		<header className={styles.topbar}>
			<div className={styles.topbarInner}>
				{/* Mobile menu button */}
				<button
					type="button"
					className={styles.mobileMenuBtn}
					onClick={onMenuToggle}
					aria-label="Toggle navigation menu"
				>
					<Menu size={18} />
				</button>

				{/* Center content (page header) */}
				<div className={styles.centerHeader}>
					{header.centerContent ? (
						header.centerContent
					) : header.title || header.subtitle || header.icon ? (
						<Stack gap={0}>
							<HStack gap={2} align="center">
								{header.icon && (
									<span className={styles.headerIconWrap}>{header.icon}</span>
								)}
								{header.title && (
									<Text size="sm" weight="semibold">
										{header.title}
									</Text>
								)}
							</HStack>
							{header.subtitle && (
								<Text size="xs" color="muted">
									{header.subtitle}
								</Text>
							)}
						</Stack>
					) : null}
				</div>

				{/* Right side */}
				<HStack gap={2} align="center" className={styles.topbarActions}>
					<span className={styles.timeBadge} aria-label="Local time">
						{timeLabel}
					</span>

					{passkeySessionActive && (
						<Badge
							color="primary"
							variant="outline"
							size="sm"
							className={styles.passkeyBadge}
						>
							<KeyRound size={12} />
							Passkey session
						</Badge>
					)}

					<span className={styles.userBadge}>
						{isAdmin && <AdminCrownPixel size={15} className={styles.userCrown} />}
						<span className={styles.userName}>{displayLabel}</span>
						<span
							className={cn(
								styles.roleBadge,
								isAdmin ? styles.roleBadgeAdmin : styles.roleBadgeUser,
							)}
						>
							{appRole}
						</span>
					</span>

					<Button variant="secondary" size="sm" onClick={() => void signOut()}>
						Sign out
					</Button>
				</HStack>
			</div>
		</header>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// FIRST LOGIN NAME PROMPT
// ═══════════════════════════════════════════════════════════════════════════
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
		<div className={styles.promptOverlay}>
			<Panel variant="elevated" padding="lg" className={styles.promptPanel}>
				<form onSubmit={(event) => void submit(event)}>
					<Stack gap={4}>
						<div>
							<Text as="h2" size="3xl" weight="semibold" block>
								Thanks for signing up!
							</Text>
							<Text
								color="muted"
								size="sm"
								className={styles.promptSubtitle}
								block
							>
								What should we call you?
							</Text>
						</div>

						<Input
							type="text"
							placeholder="Enter your name"
							value={value}
							onChange={(event) => setValue(event.target.value)}
							autoFocus
							maxLength={64}
							required
						/>

						{error && (
							<Panel
								variant="outline"
								padding="sm"
								className={styles.promptError}
							>
								<Text size="sm" color="danger">
									{error}
								</Text>
							</Panel>
						)}

						<div className={styles.promptActions}>
							<Button
								type="submit"
								variant="primary"
								disabled={saving || value.trim().length < 2}
								loading={saving}
							>
								{saving ? "Saving…" : "Continue"}
							</Button>
						</div>
					</Stack>
				</form>
			</Panel>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// NAV ITEM STYLING
// ═══════════════════════════════════════════════════════════════════════════
const navItemClass = (isActive: boolean) =>
	cn(styles.navItem, isActive && styles.navItemActive);

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR NAV
// ═══════════════════════════════════════════════════════════════════════════
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
	const { user } = useAuth();
	const canAccessCommandCenter = isCommandCenterAuthorized(user);
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
		<nav ref={navRef} className={styles.sidebarNav}>
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

			{canAccessCommandCenter && (
				<NavLink
					to="/app/command-center"
					className={({ isActive }) => navItemClass(isActive)}
					onClick={onNavigate}
				>
					<TerminalSquare size={16} />
					<span>Command Center</span>
				</NavLink>
			)}
		</nav>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR BRAND
// ═══════════════════════════════════════════════════════════════════════════
function SidebarBrand() {
	return (
		<NavLink
			to="/app/dashboard"
			className={styles.brandLink}
			aria-label="Go to dashboard"
		>
			<div className={styles.brandMark}>
				<span className={styles.brandCell} />
				<span className={styles.brandCell} />
				<span className={styles.brandCell} />
				<span className={styles.brandCell} />
			</div>
			<Text size="lg" weight="semibold" className={styles.brandText}>
				{APP_NAME}
			</Text>
		</NavLink>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// DESKTOP SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════
function DesktopSidebar() {
	return (
		<aside className={styles.desktopSidebar} aria-label="Workspace navigation">
			<div className={styles.desktopSidebarBrand}>
				<SidebarBrand />
			</div>
			<div className={styles.desktopSidebarContent}>
				<SidebarNav />
			</div>
		</aside>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE DRAWER
// ═══════════════════════════════════════════════════════════════════════════
function MobileDrawer({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
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
		<div className={styles.mobileOverlay}>
			{/* Backdrop */}
			<div className={styles.mobileBackdrop} onClick={onClose} />

			{/* Drawer */}
			<aside className={styles.mobileDrawer}>
				<div className={styles.mobileDrawerHeader}>
					<SidebarBrand />
					<button
						type="button"
						onClick={onClose}
						className={styles.mobileDrawerClose}
						aria-label="Close menu"
					>
						<X size={18} />
					</button>
				</div>
				<div className={styles.mobileDrawerContent}>
					<SidebarNav onNavigate={onClose} />
				</div>
			</aside>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// APP SHELL (MAIN EXPORT)
// ═══════════════════════════════════════════════════════════════════════════
export default function AppShell() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const { pathname } = useLocation();

	const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

	useEffect(() => {
		if (!pathname) return;
		scrollRef.current?.scrollTo({ top: 0 });
	}, [pathname]);

	return (
		<PageHeaderProvider>
			<div className={styles.appRoot}>
				<AppTopbar onMenuToggle={() => setMobileMenuOpen((p) => !p)} />
				<FirstLoginNamePrompt />
				<MobileDrawer open={mobileMenuOpen} onClose={closeMobileMenu} />

				<div className={styles.shellBody}>
					<DesktopSidebar />
					<main ref={scrollRef} className={styles.main}>
						<Container size="full" padded={false}>
							<Outlet />
						</Container>
					</main>
				</div>
			</div>
		</PageHeaderProvider>
	);
}
