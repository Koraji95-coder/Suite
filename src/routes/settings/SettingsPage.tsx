// src/routes/app/settings/SettingsPage.tsx
import {
  Bot,
  Palette,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// Primitives
import { Text, Heading } from "@/components/primitives/Text";
import { Panel } from "@/components/primitives/Panel";
import { Stack, HStack } from "@/components/primitives/Stack";
import { Badge } from "@/components/primitives/Badge";

import AccountSettings from "./AccountSettings";
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
    id: "account",
    label: "Account",
    description: "Profile, passkeys, sessions, and account actions.",
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
  const storedRaw = localStorage.getItem(STORAGE_KEY) || "";
  const stored =
    storedRaw === "email" || storedRaw === "profile" ? "account" : storedRaw;
  if (stored && TABS.some((tab) => tab.id === stored)) {
    return stored as TabId;
  }
  return "theme";
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>(() => getInitialTab());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  const ActiveContent = useMemo(() => {
    switch (activeTab) {
      case "theme":
        return <ThemePicker />;
      case "account":
        return <AccountSettings />;
      case "ai":
        return <AIConfigPlaceholder />;
      default:
        return null;
    }
  }, [activeTab]);

  const activeMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  return (
    <div className="mx-auto max-w-6xl">
      {/* ═══════════════════════════════════════════════════════════════════
          PAGE HEADER
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="mb-6">
        <HStack gap={3} align="center" className="mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <SettingsIcon size={20} />
          </div>
          <div>
            <Heading level={1}>Settings</Heading>
            <Text size="sm" color="muted">
              Customize your workspace, account, and operational preferences.
            </Text>
          </div>
        </HStack>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN LAYOUT
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* ─────────────────────────────────────────────────────────────────
            SIDEBAR
        ───────────────────────────────────────────────────────────────── */}
        <aside aria-label="Settings sections">
          <Panel variant="default" padding="md">
            <Stack gap={4}>
              {/* Coverage card */}
              <div className="rounded-xl border border-border bg-surface-2/50 p-3">
                <Text size="xs" color="muted" weight="medium" className="uppercase tracking-wider">
                  Workspace profile
                </Text>
                <Text size="sm" weight="semibold" className="mt-1" block>
                  Settings coverage
                </Text>
                <HStack gap={2} align="center" className="mt-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(TABS.length / TABS.length) * 100}%` }}
                    />
                  </div>
                  <Text size="xs" color="muted">
                    {TABS.length}/{TABS.length}
                  </Text>
                </HStack>
              </div>

              {/* Navigation */}
              <nav>
                <Stack gap={1}>
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = tab.id === activeTab;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                          w-full rounded-xl border px-3 py-2.5 text-left transition-all
                          ${isActive 
                            ? "border-primary bg-primary/10" 
                            : "border-border bg-surface hover:bg-surface-2"
                          }
                        `}
                      >
                        <HStack gap={2} align="center">
                          <div className={`
                            flex h-7 w-7 items-center justify-center rounded-lg
                            ${isActive ? "bg-primary/20 text-primary" : "bg-surface-2 text-text-muted"}
                          `}>
                            <Icon size={14} />
                          </div>
                          <Stack gap={0} className="flex-1 min-w-0">
                            <Text size="sm" weight="medium" color={isActive ? "default" : "muted"}>
                              {tab.label}
                            </Text>
                            <Text size="xs" color="muted" truncate>
                              {tab.description}
                            </Text>
                          </Stack>
                          {isActive && (
                            <div className="h-2 w-2 rounded-full bg-primary" />
                          )}
                        </HStack>
                      </button>
                    );
                  })}
                </Stack>
              </nav>
            </Stack>
          </Panel>
        </aside>

        {/* ─────────────────────────────────────────────────────────────────
            MAIN CONTENT
        ───────────────────────────────────────────────────────────────── */}
        <section>
          <Stack gap={4}>
            {/* Section header */}
            <Panel variant="default" padding="md">
              <HStack align="center" justify="between" wrap className="gap-4">
                <Stack gap={1}>
                  <Text size="xs" color="muted" weight="medium" className="uppercase tracking-wider">
                    Current section
                  </Text>
                  <HStack gap={2} align="center">
                    <Text size="lg" weight="semibold">
                      {activeMeta.label}
                    </Text>
                    <Badge color="primary" variant="soft" size="sm">
                      Active
                    </Badge>
                  </HStack>
                  <Text size="sm" color="muted">
                    {activeMeta.description}
                  </Text>
                </Stack>

                {/* Quick tab switcher */}
                <HStack gap={2} wrap>
                  {TABS.map((tab) => {
                    const isActive = tab.id === activeTab;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                          rounded-full border px-3 py-1.5 text-xs font-medium transition-all
                          ${isActive 
                            ? "border-primary bg-primary/10 text-text" 
                            : "border-border text-text-muted hover:bg-surface-2 hover:text-text"
                          }
                        `}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </HStack>
              </HStack>
            </Panel>

            {/* Active content */}
            <div>{ActiveContent}</div>
          </Stack>
        </section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AI CONFIG PLACEHOLDER
// ═══════════════════════════════════════════════════════════════════════════
function AIConfigPlaceholder() {
  return (
    <Panel variant="default" padding="lg">
      <Stack gap={4}>
        <HStack gap={3} align="start">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Bot size={20} />
          </div>
          <Stack gap={1}>
            <Text size="lg" weight="semibold">
              AI Configuration
            </Text>
            <Text size="sm" color="muted">
              Provider selection and prompts.
            </Text>
          </Stack>
        </HStack>

        <Panel variant="inset" padding="lg" className="text-center">
          <div className="flex flex-col items-center py-6">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2">
              <Bot size={28} className="text-text-muted" />
            </div>
            <Text size="md" weight="semibold" block>
              Coming Soon
            </Text>
            <Text size="sm" color="muted" className="mt-1 max-w-xs" block>
              Model selection, temperature controls, and system prompts will be available here.
            </Text>
            <Badge color="info" variant="soft" className="mt-4">
              In Development
            </Badge>
          </div>
        </Panel>
      </Stack>
    </Panel>
  );
}