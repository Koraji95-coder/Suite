// src/routes/AppShell.tsx
import {
	AppWindow,
	BookOpen,
	Bug,
	CalendarDays,
	ChevronRight,
	ClipboardList,
	Clock3,
	FolderOpen,
	KeyRound,
	LayoutDashboard,
	LogOut,
	Menu,
	Radar,
	RefreshCw,
	Settings,
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
import { SuiteLogo } from "../components/brand/SuiteLogo";
import { Badge } from "../components/primitives/Badge";
// Primitives
import { Button } from "../components/primitives/Button";
import { Container } from "../components/primitives/Container";
import { Input } from "../components/primitives/Input";
import { Panel } from "../components/primitives/Panel";
import { Stack } from "../components/primitives/Stack";
import { Text } from "../components/primitives/Text";
import AdminCrownPixel from "../components/roles/AdminCrownPixel";
import { useSuiteRuntimeDoctor } from "../hooks/useSuiteRuntimeDoctor";
import { useWatchdogProjectSync } from "../hooks/useWatchdogProjectSync";
import {
	type AppDiagnostic,
	clearAppDiagnostics,
	subscribeAppDiagnostics,
} from "../lib/appDiagnostics";
import {
	type AppAudience,
	canAccessAudience,
	isDevAudience,
} from "../lib/audience";
import type { SuiteRuntimeDoctorReport } from "../lib/runtimeDoctor";
import { getAppRole } from "../lib/roles";
import { cn } from "../lib/utils";
import styles from "./AppShell.module.css";
import { resolveShellMeta } from "./appShellMeta";

type ShellNavItem = {
	to: string;
	label: string;
	icon: typeof LayoutDashboard;
	audience: AppAudience;
};

const primaryNavItems: ShellNavItem[] = [
	{
		to: "/app/dashboard",
		label: "Dashboard",
		icon: LayoutDashboard,
		audience: "customer",
	},
	{ to: "/app/watchdog", label: "Watchdog", icon: Radar, audience: "customer" },
	{
		to: "/app/projects",
		label: "Projects",
		icon: FolderOpen,
		audience: "customer",
	},
	{
		to: "/app/calendar",
		label: "Calendar",
		icon: CalendarDays,
		audience: "customer",
	},
	{ to: "/app/apps", label: "Apps", icon: AppWindow, audience: "customer" },
	{
		to: "/app/knowledge",
		label: "Knowledge",
		icon: BookOpen,
		audience: "customer",
	},
];

const developerNavItems: ShellNavItem[] = [
	{
		to: "/app/developer",
		label: "Developer",
		icon: ClipboardList,
		audience: "dev",
	},
];

function FirstLoginNamePrompt() {
	const { user, profile, loading, profileHydrating, updateProfile } = useAuth();
	const [value, setValue] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const currentName =
		profile?.display_name?.trim() ||
		(typeof user?.user_metadata?.display_name === "string"
			? user.user_metadata.display_name.trim()
			: "");

	const shouldShow = Boolean(
		!loading && !profileHydrating && user && !currentName,
	);
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

const navItemClass = (isActive: boolean) =>
	cn(styles.navItem, isActive && styles.navItemActive);

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
	const { user } = useAuth();
	const canAccessCommandCenter = isDevAudience(user);
	const navRef = useRef<HTMLElement | null>(null);

	const safeNavItems = primaryNavItems.filter(
		(item) =>
			item.to.trim().length > 0 &&
			item.label.trim().length > 0 &&
			canAccessAudience(user, item.audience),
	);
	const safeDeveloperNavItems = developerNavItems.filter(
		(item) =>
			item.to.trim().length > 0 &&
			item.label.trim().length > 0 &&
			canAccessAudience(user, item.audience),
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
			<div className={styles.navGroup}>
				<div className={styles.navGroupLabel}>Workspace</div>
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
			</div>

			{canAccessCommandCenter ? (
				<div className={styles.navGroup}>
					<div className={styles.navGroupLabel}>Developer</div>
					{safeDeveloperNavItems.map((item) => {
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
				</div>
			) : null}
		</nav>
	);
}

function SidebarBrand() {
	return (
		<NavLink
			to="/app/dashboard"
			className={styles.brandLink}
			aria-label="Go to dashboard"
		>
			<SuiteLogo variant="compact" size="md" />
		</NavLink>
	);
}

function SidebarSessionCluster({ compact = false }: { compact?: boolean }) {
	const { signOut, user, profile, sessionAuthMethod } = useAuth();
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
		<div
			className={cn(
				styles.sidebarFooterCluster,
				compact && styles.sidebarFooterCompact,
			)}
		>
			<div className={styles.sessionClock} aria-label="Local time">
				<Clock3 size={13} />
				<span>{timeLabel}</span>
			</div>

			<div className={styles.sessionIdentity}>
				{isAdmin && (
					<AdminCrownPixel size={14} className={styles.sessionCrown} />
				)}
				<div className={styles.sessionIdentityText}>
					<span className={styles.sessionName}>{displayLabel}</span>
					<span
						className={cn(
							styles.sessionRole,
							isAdmin ? styles.sessionRoleAdmin : styles.sessionRoleUser,
						)}
					>
						{appRole}
					</span>
				</div>
			</div>

			{passkeySessionActive && (
				<Badge
					color="accent"
					variant="outline"
					size="sm"
					className={styles.sessionPasskeyBadge}
				>
					<KeyRound size={11} />
					Authenticated
				</Badge>
			)}

			<Button
				variant="secondary"
				size="sm"
				onClick={() => void signOut()}
				className={styles.sessionSignOut}
				iconLeft={<LogOut size={13} />}
			>
				Sign out
			</Button>
		</div>
	);
}

function DesktopSidebar() {
	return (
		<aside className={styles.desktopSidebar} aria-label="Workspace navigation">
			<div className={styles.desktopSidebarBrand}>
				<SidebarBrand />
			</div>
			<div className={styles.desktopSidebarContent}>
				<SidebarNav />
			</div>
			<div className={styles.desktopSidebarFooter}>
				<SidebarSessionCluster />
			</div>
		</aside>
	);
}

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
			<div className={styles.mobileBackdrop} onClick={onClose} />

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
				<div className={styles.mobileDrawerFooter}>
					<SidebarSessionCluster compact />
				</div>
			</aside>
		</div>
	);
}

function AppDiagnosticsDrawer({
	open,
	onClose,
	diagnostics,
	report,
	loading,
	onRefresh,
}: {
	open: boolean;
	onClose: () => void;
	diagnostics: AppDiagnostic[];
	report: SuiteRuntimeDoctorReport | null;
	loading: boolean;
	onRefresh: () => void;
}) {
	if (!open) return null;

	return (
		<div className={styles.diagnosticsOverlay}>
			<div className={styles.diagnosticsBackdrop} onClick={onClose} />
			<aside className={styles.diagnosticsDrawer}>
				<div className={styles.diagnosticsHeader}>
					<div>
						<Text size="sm" weight="semibold" block>
							Diagnostics
						</Text>
						<Text size="xs" color="muted" block>
							Runtime drift, route availability, and recent actionable warnings.
						</Text>
					</div>
					<div className={styles.diagnosticsHeaderActions}>
						<Button
							variant="ghost"
							size="sm"
							iconLeft={<RefreshCw size={14} />}
							onClick={onRefresh}
							disabled={loading}
						>
							{loading ? "Checking..." : "Run doctor"}
						</Button>
						<Button variant="ghost" size="sm" onClick={clearAppDiagnostics}>
							Clear
						</Button>
						<button
							type="button"
							onClick={onClose}
							className={styles.diagnosticsClose}
							aria-label="Close diagnostics"
						>
							<X size={16} />
						</button>
					</div>
				</div>

				<div className={styles.diagnosticsBody}>
					<Panel
						variant="default"
						padding="md"
						className={styles.diagnosticsCard}
					>
						<div className={styles.diagnosticsCardHeader}>
							<Text size="xs" weight="semibold">
								Runtime doctor
							</Text>
							{report ? (
								<Badge
									color={report.ok ? "success" : "warning"}
									variant="soft"
									size="sm"
								>
									{report.ok ? "ok" : "attention"}
								</Badge>
							) : (
								<Badge color="default" variant="outline" size="sm">
									not run
								</Badge>
							)}
						</div>
						<div className={styles.diagnosticsList}>
							{report?.checks?.length ? (
								report.checks.map((check) => (
									<div key={check.key} className={styles.diagnosticsItem}>
										<div className={styles.diagnosticsItemHeader}>
											<strong>{check.label}</strong>
											<Badge
												color={
													check.status === "ok"
														? "success"
														: check.status === "warning"
															? "warning"
															: "danger"
												}
												variant="soft"
												size="sm"
											>
												{check.status}
											</Badge>
										</div>
										<div className={styles.diagnosticsItemMessage}>
											{check.detail}
										</div>
									</div>
								))
							) : (
								<div className={styles.diagnosticsEmpty}>
									Run the doctor to validate backend routes, proxy behavior, and
									Supabase table availability.
								</div>
							)}
						</div>
					</Panel>

					<Panel
						variant="default"
						padding="md"
						className={styles.diagnosticsCard}
					>
						<div className={styles.diagnosticsCardHeader}>
							<Text size="xs" weight="semibold">
								Recent diagnostics
							</Text>
							<Badge
								color={diagnostics.length > 0 ? "warning" : "default"}
								variant="soft"
								size="sm"
							>
								{diagnostics.length}
							</Badge>
						</div>
						<div className={styles.diagnosticsList}>
							{diagnostics.length === 0 ? (
								<div className={styles.diagnosticsEmpty}>
									No actionable diagnostics have been captured in this session.
								</div>
							) : (
								diagnostics.slice(0, 20).map((entry) => (
									<div key={entry.id} className={styles.diagnosticsItem}>
										<div className={styles.diagnosticsItemHeader}>
											<strong>{entry.title}</strong>
											<Badge
												color={
													entry.severity === "error"
														? "danger"
														: entry.severity === "warning"
															? "warning"
															: "primary"
												}
												variant="soft"
												size="sm"
											>
												{entry.severity}
											</Badge>
										</div>
										<div className={styles.diagnosticsItemMessage}>
											{entry.message}
										</div>
										<div className={styles.diagnosticsItemMeta}>
											<span>{entry.source}</span>
											{entry.context ? <span>{entry.context}</span> : null}
											{entry.occurrences > 1 ? (
												<span>{entry.occurrences}x</span>
											) : null}
											<span>
												{new Date(entry.timestamp).toLocaleTimeString([], {
													hour: "numeric",
													minute: "2-digit",
													second: "2-digit",
												})}
											</span>
										</div>
									</div>
								))
							)}
						</div>
					</Panel>
				</div>
			</aside>
		</div>
	);
}

export default function AppShell() {
	return (
		<PageHeaderProvider>
			<ShellWorkspace />
		</PageHeaderProvider>
	);
}

function ShellWorkspace() {
	useWatchdogProjectSync();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
	const [diagnostics, setDiagnostics] = useState<AppDiagnostic[]>([]);
	const {
		report: runtimeReport,
		loading: runtimeDoctorLoading,
		refreshing: runtimeDoctorRefreshing,
		refreshNow: refreshRuntimeDoctor,
	} = useSuiteRuntimeDoctor();
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const { pathname } = useLocation();
	const { header } = usePageHeader();
	const shellMeta = useMemo(() => resolveShellMeta(pathname), [pathname]);
	const ShellMetaIcon = shellMeta.icon;

	const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

	useEffect(() => {
		if (!pathname) return;
		if (typeof scrollRef.current?.scrollTo === "function") {
			scrollRef.current.scrollTo({ top: 0 });
		} else if (scrollRef.current) {
			scrollRef.current.scrollTop = 0;
		}
		setMobileMenuOpen(false);
	}, [pathname]);

	useEffect(() => subscribeAppDiagnostics(setDiagnostics), []);

	const resolvedTitle = header.title || shellMeta.title;
	const resolvedSubtitle = header.subtitle || shellMeta.subtitle;
	const actionableDiagnostics = diagnostics.filter(
		(entry) => entry.severity === "error" || entry.severity === "warning",
	);
	const doctorIssueCount = runtimeReport?.actionableIssueCount ?? 0;
	const diagnosticsCount = Math.max(
		actionableDiagnostics.length,
		doctorIssueCount,
	);
	const diagnosticsTone =
		runtimeReport?.checks.some(
			(check) => check.status === "error" && check.actionable !== false,
		) || actionableDiagnostics.some((entry) => entry.severity === "error")
			? "danger"
			: diagnosticsCount > 0
				? "warning"
				: "success";
	const diagnosticsDisplayCount =
		diagnosticsCount > 99 ? "99+" : diagnosticsCount.toString();
	const diagnosticsButtonToneClass =
		diagnosticsTone === "danger"
			? styles.diagnosticsToggleDanger
			: diagnosticsTone === "warning"
				? styles.diagnosticsToggleWarning
				: styles.diagnosticsToggleSuccess;
	const diagnosticsStatusLabel =
		diagnosticsTone === "danger"
			? "attention required"
			: diagnosticsTone === "warning"
				? "warnings present"
				: "all checks clear";
	const resolvedHeaderIcon = header.icon ?? <ShellMetaIcon size={14} />;

	return (
		<div className={styles.appRoot}>
			<FirstLoginNamePrompt />
			<MobileDrawer open={mobileMenuOpen} onClose={closeMobileMenu} />
			<AppDiagnosticsDrawer
				open={diagnosticsOpen}
				onClose={() => setDiagnosticsOpen(false)}
				diagnostics={actionableDiagnostics}
				report={runtimeReport}
				loading={runtimeDoctorLoading || runtimeDoctorRefreshing}
				onRefresh={() => void refreshRuntimeDoctor("manual")}
			/>

			<div className={styles.shellBody}>
				<DesktopSidebar />
				<main ref={scrollRef} className={styles.main}>
					<div className={styles.commandFrame}>
						<div className={styles.workspaceSurface}>
							<header className={styles.workspaceHeader}>
								<div className={styles.workspaceHeaderMain}>
									<button
										type="button"
										className={styles.mobileMenuTrigger}
										onClick={() => setMobileMenuOpen((previous) => !previous)}
										aria-label="Open navigation menu"
									>
										<Menu size={18} />
									</button>
									<div className={styles.workspaceHeaderTitleBlock}>
										<div className={styles.workspaceHeaderEyebrow}>
											<span className={styles.workspaceHeaderEyebrowIcon}>
												{resolvedHeaderIcon}
											</span>
											<span>{APP_NAME} Workspace</span>
										</div>
										<Text
											as="h1"
											size="lg"
											weight="semibold"
											block
											className={styles.workspaceHeaderTitle}
										>
											{resolvedTitle}
										</Text>
										<Text
											size="xs"
											color="muted"
											block
											className={styles.workspaceHeaderSubtitle}
										>
											{resolvedSubtitle}
										</Text>
									</div>
								</div>
								<div className={styles.workspaceHeaderMeta}>
									<Badge
										color="accent"
										variant="soft"
										size="sm"
										className={styles.workspaceRailChip}
									>
										Suite workspace
									</Badge>
									<div className={styles.workspaceHeaderRailPair}>
										<Badge
											color="default"
											variant="soft"
											size="sm"
											className={styles.workspaceRailChip}
										>
											Area
										</Badge>
										<Badge
											color="primary"
											variant="outline"
											size="sm"
											className={styles.workspaceRailValue}
										>
											{shellMeta.areaLabel}
										</Badge>
									</div>
									<button
										type="button"
										className={cn(
											styles.diagnosticsToggle,
											diagnosticsButtonToneClass,
										)}
										onClick={() => setDiagnosticsOpen(true)}
										aria-label={`Diagnostics ${diagnosticsStatusLabel}, ${diagnosticsDisplayCount} item${diagnosticsCount === 1 ? "" : "s"}`}
									>
										<span className={styles.diagnosticsToggleLead}>
											<Bug size={14} />
											<span className={styles.diagnosticsToggleLabel}>
												Diagnostics
											</span>
										</span>
										<span className={styles.diagnosticsToggleCount}>
											{diagnosticsDisplayCount}
										</span>
										<ChevronRight size={14} />
									</button>
								</div>
							</header>

							<section className={styles.workspaceContent}>
								<Container size="full" padded={false}>
									<Outlet />
								</Container>
							</section>
						</div>
					</div>
				</main>
			</div>
		</div>
	);
}
