// src/routes/AppShell.tsx
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

// Primitives
import { Button } from "../components/primitives/Button";
import { Text } from "../components/primitives/Text";
import { Badge } from "../components/primitives/Badge";
import { Input } from "../components/primitives/Input";
import { Panel } from "../components/primitives/Panel";
import { Stack, HStack } from "../components/primitives/Stack";

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
  { to: "/app/architecture-map", label: "Architecture", icon: Network },
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

  return (
    <header 
      className="flex-none border-b border-border bg-bg/86 backdrop-blur-md"
      style={{ zIndex: 48 }}
    >
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3 md:px-6">
        {/* Mobile menu button */}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-xl border border-border bg-surface p-2 text-text transition hover:bg-surface-2 md:hidden"
          onClick={onMenuToggle}
          aria-label="Toggle navigation menu"
        >
          <Menu size={18} />
        </button>

        {/* Center content (page header) */}
        <div className="hidden flex-1 justify-start px-1 md:flex">
          {header.centerContent ? (
            header.centerContent
          ) : header.title || header.subtitle || header.icon ? (
            <Stack gap={0}>
              <HStack gap={2} align="center">
                {header.icon && (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-text">
                    {header.icon}
                  </span>
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
        <HStack gap={2} align="center">
          <span
            className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-text-muted"
            aria-label="Local time"
          >
            {timeLabel}
          </span>

          {passkeySessionActive && (
            <Badge color="primary" variant="outline" size="sm" className="hidden sm:inline-flex">
              <KeyRound size={12} />
              Passkey session
            </Badge>
          )}

          <span className="hidden rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-text sm:inline-flex">
            {displayLabel}
          </span>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void signOut()}
          >
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
    <div 
      className="fixed inset-0 grid place-items-center bg-bg/90 p-6 backdrop-blur-md"
      style={{ zIndex: 100 }}
    >
      <Panel variant="elevated" padding="lg" className="w-full max-w-[520px]">
        <form onSubmit={(event) => void submit(event)}>
          <Stack gap={4}>
            <div>
              <Text as="h2" size="3xl" weight="semibold" block>
                Thanks for signing up!
              </Text>
              <Text color="muted" size="sm" className="mt-2" block>
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
              <Panel variant="outline" padding="sm" className="border-danger/40 bg-danger/10">
                <Text size="sm" color="danger">
                  {error}
                </Text>
              </Panel>
            )}

            <div className="flex justify-end">
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
  [
    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition",
    isActive
      ? "bg-surface text-text"
      : "text-text-muted hover:bg-surface-2 hover:text-text",
  ].join(" ");

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR NAV
// ═══════════════════════════════════════════════════════════════════════════
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
      className="inline-flex items-center gap-3 px-3 py-1 no-underline"
      aria-label="Go to dashboard"
    >
      <div className="grid h-9 w-9 grid-cols-2 gap-0.5 rounded-[14px] border border-border bg-surface p-1">
        <span className="rounded-[4px] bg-primary" />
        <span className="rounded-[4px] bg-accent" />
        <span className="rounded-[4px] bg-text/70" />
        <span className="rounded-[4px] bg-primary" />
      </div>
      <Text size="lg" weight="semibold" className="leading-none tracking-tight">
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
    <aside
      className="hidden md:flex flex-col w-[220px] flex-none border-r border-border bg-bg"
      aria-label="Workspace navigation"
      style={{ zIndex: 48 }}
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

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE DRAWER
// ═══════════════════════════════════════════════════════════════════════════
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
    <div className="fixed inset-0 md:hidden" style={{ zIndex: 50 }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col border-r border-border bg-bg shadow-2xl">
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

// ═══════════════════════════════════════════════════════════════════════════
// APP SHELL (MAIN EXPORT)
// ═══════════════════════════════════════════════════════════════════════════
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
      <div className="flex h-dvh flex-col overflow-hidden bg-bg text-text">
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