import { useState } from "react";
import { useTheme, hexToRgba } from "@/lib/palette";
import { Palette, User, Mail, Bot, Settings } from "lucide-react";
import { ThemePicker } from "./ThemePicker";
import { ProfileSettings } from "./ProfileSettings";
import { EmailConfig } from "./EmailConfig";

const TABS = [
  { id: "theme", label: "Theme", icon: Palette },
  { id: "profile", label: "Profile", icon: User },
  { id: "email", label: "Email", icon: Mail },
  { id: "ai", label: "AI Config", icon: Bot },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsPage() {
  const { palette } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>("theme");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "16px 24px",
          borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Settings size={20} color={palette.primary} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: palette.text, margin: 0 }}>Settings</h2>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div
          style={{
            width: 200,
            flexShrink: 0,
            borderRight: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
            padding: "12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: isActive ? hexToRgba(palette.primary, 0.12) : "transparent",
                  color: isActive ? palette.text : palette.textMuted,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = hexToRgba(palette.surfaceLight, 0.4);
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <Icon size={16} color={isActive ? palette.primary : palette.textMuted} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          {activeTab === "theme" && <ThemePicker />}
          {activeTab === "profile" && <ProfileSettings />}
          {activeTab === "email" && <EmailConfig />}
          {activeTab === "ai" && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: palette.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <Bot size={16} />
                AI Configuration
              </h3>
              <div
                style={{
                  padding: "32px 24px",
                  borderRadius: 12,
                  background: hexToRgba(palette.surface, 0.5),
                  border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
                  textAlign: "center",
                }}
              >
                <Bot size={32} color={palette.textMuted} style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: palette.text, marginBottom: 6 }}>
                  Coming Soon
                </div>
                <div style={{ fontSize: 13, color: palette.textMuted, maxWidth: 360, margin: "0 auto" }}>
                  AI provider selection, model configuration, temperature controls, and custom system prompts will be available here.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
