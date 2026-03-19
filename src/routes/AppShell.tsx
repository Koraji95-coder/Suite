// src/routes/AppShell.tsx
import {
	AlertTriangle,
	AppWindow,
	BookOpen,
	Bug,
	CalendarDays,
	ChevronRight,
	ClipboardList,
	Clock3,
	Compass,
	FolderOpen,
	KeyRound,
	LayoutDashboard,
	Layers3,
	LogOut,
	Menu,
	RefreshCw,
	Settings,
	Sparkles,
	TerminalSquare,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { APP_NAME } from "../appMeta";
import { useAuth } from "../auth/useAuth";
import { SuiteLogo } from "../components/brand/SuiteLogo";
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
import { Stack } from "../components/primitives/Stack";
import { Text } from "../components/primitives/Text";
import {
	clearAppDiagnostics,
	subscribeAppDiagnostics,
	type AppDiagnostic,
} from "../lib/appDiagnostics";
import { isCommandCenterAuthorized } from "../lib/devAccess";
import { runSuiteRuntimeDoctor, type SuiteRuntimeDoctorReport } from "../lib/runtimeDoctor";
import { getAppRole } from "../lib/roles";
import { cn } from "../lib/utils";
import styles from "./AppShell.module.css";

const primaryNavItems = [
	{ to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/app/projects", label: "Projects", icon: FolderOpen },
	{ to: "/app/calendar", label: "Calendar", icon: CalendarDays },
	{ to: "/app/changelog", label: "Changelog", icon: ClipboardList },
	{ to: "/app/apps", label: "Apps", icon: AppWindow },
	{ to: "/app/knowledge", label: "Knowledge", icon: BookOpen },
	{ to: "/app/agent", label: "Agents", icon: Sparkles },
];

const sectionMeta = [
	{
		match: "/app/dashboard",
		label: "Dashboard",
		subtitle: "Cross-system command center for operations, architecture, and memory.",
		icon: LayoutDashboard,
	},
	{
		match: "/app/projects",
		label: "Projects",
		subtitle: "Project planning, telemetry, tasks, and delivery workflows.",
		icon: FolderOpen,
	},
	{
		match: "/app/calendar",
		label: "Calendar",
		subtitle: "Scheduling, commitments, and upcoming delivery timing.",
		icon: CalendarDays,
	},
	{
		match: "/app/changelog",
		label: "Changelog",
		subtitle: "Canonical work ledger, linked checkpoints, and publish-ready notes.",
		icon: ClipboardList,
	},
	{
		match: "/app/apps",
		label: "Apps",
		subtitle: "Domain tools for drafting, transmittals, and engineering workflows.",
		icon: Layers3,
	},
	{
		match: "/app/knowledge",
		label: "Knowledge",
		subtitle: "References, formulas, standards context, and reusable guidance.",
		icon: Compass,
	},
	{
		match: "/app/agent",
		label: "Agents",
		subtitle: "Profile-driven orchestration and collaborative execution.",
		icon: Sparkles,
	},
	{
		match: "/app/settings",
		label: "Settings",
		subtitle: "Account controls and workspace preferences.",
		icon: Settings,
	},
	{
		match: "/app/command-center",
		label: "Command Center",
		subtitle: "Developer diagnostics and incident-oriented controls.",
		icon: TerminalSquare,
	},
] as const;

function resolveShellMeta(pathname: string) {
	const matched = sectionMeta.find((item) => pathname.startsWith(item.match));
	return (
		matched ?? {
			label: "Workspace",
			subtitle: "Suite operations and delivery workspace.",
			icon: AppWindow,
		}
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
		<div className={cn(styles.sidebarFooterCluster, compact && styles.sidebarFooterCompact)}>
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
						<Text size="sm" weight="semibold">
							Diagnostics
						</Text>
						<Text size="xs" color="muted">
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
					<Panel variant="default" padding="md" className={styles.diagnosticsCard}>
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

					<Panel variant="default" padding="md" className={styles.diagnosticsCard}>
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
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
	const [diagnostics, setDiagnostics] = useState<AppDiagnostic[]>([]);
	const [runtimeReport, setRuntimeReport] =
		useState<SuiteRuntimeDoctorReport | null>(null);
	const [runtimeDoctorLoading, setRuntimeDoctorLoading] = useState(false);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const { pathname } = useLocation();
	const { header } = usePageHeader();
	const shellMeta = useMemo(() => resolveShellMeta(pathname), [pathname]);
	const HeaderIcon = shellMeta.icon;

	const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

	useEffect(() => {
		if (!pathname) return;
		scrollRef.current?.scrollTo({ top: 0 });
		setMobileMenuOpen(false);
	}, [pathname]);

	const refreshRuntimeDoctor = useCallback(() => {
		setRuntimeDoctorLoading(true);
		void runSuiteRuntimeDoctor()
			.then((report) => {
				setRuntimeReport(report);
			})
			.finally(() => {
				setRuntimeDoctorLoading(false);
			});
	}, []);

	useEffect(() => subscribeAppDiagnostics(setDiagnostics), []);

	useEffect(() => {
		refreshRuntimeDoctor();
	}, [refreshRuntimeDoctor]);

	const resolvedTitle = header.title || shellMeta.label;
	const resolvedSubtitle = header.subtitle || shellMeta.subtitle;
	const actionableDiagnostics = diagnostics.filter(
		(entry) => entry.severity === "error" || entry.severity === "warning",
	);
	const doctorIssueCount =
		runtimeReport?.checks.filter((check) => check.status !== "ok").length ?? 0;
	const diagnosticsCount = Math.max(actionableDiagnostics.length, doctorIssueCount);
	const diagnosticsTone =
		runtimeReport?.checks.some((check) => check.status === "error") ||
		actionableDiagnostics.some((entry) => entry.severity === "error")
			? "danger"
			: diagnosticsCount > 0
				? "warning"
				: "success";

	return (
		<div className={styles.appRoot}>
			<FirstLoginNamePrompt />
			<MobileDrawer open={mobileMenuOpen} onClose={closeMobileMenu} />
			<AppDiagnosticsDrawer
				open={diagnosticsOpen}
				onClose={() => setDiagnosticsOpen(false)}
				diagnostics={actionableDiagnostics}
				report={runtimeReport}
				loading={runtimeDoctorLoading}
				onRefresh={refreshRuntimeDoctor}
			/>

			<div className={styles.shellBody}>
				<DesktopSidebar />
				<main ref={scrollRef} className={styles.main}>
					<div className={styles.commandFrame}>
						<header className={styles.workspaceHeader}>
							<div className={styles.workspaceHeaderMain}>
								<button
									type="button"
									className={styles.mobileMenuTrigger}
									onClick={() =>
										setMobileMenuOpen((previous) => !previous)
									}
									aria-label="Open navigation menu"
								>
									<Menu size={18} />
								</button>
								<div className={styles.workspaceHeaderTitleBlock}>
									<div className={styles.workspaceHeaderEyebrow}>
										<HeaderIcon size={14} />
										<span>{APP_NAME} Workspace</span>
									</div>
									<Text
										as="h1"
										size="lg"
										weight="semibold"
										className={styles.workspaceHeaderTitle}
									>
										{resolvedTitle}
									</Text>
									<Text
										size="xs"
										color="muted"
										className={styles.workspaceHeaderSubtitle}
									>
										{resolvedSubtitle}
									</Text>
								</div>
							</div>
							<div className={styles.workspaceHeaderMeta}>
								<Badge color="accent" variant="soft" size="sm">
									Operations shell
								</Badge>
								<Badge color="primary" variant="outline" size="sm">
									{shellMeta.label}
								</Badge>
								<button
									type="button"
									className={styles.diagnosticsToggle}
									onClick={() => setDiagnosticsOpen(true)}
								>
									<Bug size={14} />
									<span>Diagnostics</span>
									<Badge
										color={diagnosticsTone}
										variant="soft"
										size="sm"
										className={styles.diagnosticsToggleBadge}
									>
										{diagnosticsCount}
									</Badge>
									<ChevronRight size={14} />
								</button>
								{runtimeReport && !runtimeReport.ok ? (
									<Badge color="warning" variant="soft" size="sm">
										<AlertTriangle size={12} />
										Runtime drift
									</Badge>
								) : null}
								{header.centerContent ? (
									<div className={styles.workspaceHeaderCenterContent}>
										{header.centerContent}
									</div>
								) : null}
							</div>
						</header>

						<section className={styles.workspaceContent}>
							<Container size="full" padded={false}>
								<Outlet />
							</Container>
						</section>
					</div>
				</main>
			</div>
		</div>
	);
}
