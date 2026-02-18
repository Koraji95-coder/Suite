import { useState, useEffect } from "react";
import yaml from "js-yaml";
import { useTheme, hexToRgba } from "@/lib/palette";
import { Save, FileCode } from "lucide-react";

const STORAGE_KEY = "app-email-config";

const DEFAULT_CONFIG = {
  smtp: {
    host: "",
    port: 587,
    secure: false,
    auth: {
      user: "",
      pass: "",
    },
  },
  defaults: {
    from: "",
    replyTo: "",
    subject_prefix: "[Root3 Suite]",
  },
  notifications: {
    project_updates: true,
    task_reminders: true,
    calendar_alerts: true,
  },
};

function loadConfig(): typeof DEFAULT_CONFIG {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = yaml.load(stored);
      if (parsed && typeof parsed === "object") return parsed as typeof DEFAULT_CONFIG;
    }
  } catch { /* noop */ }
  return { ...DEFAULT_CONFIG };
}

export function EmailConfig() {
  const { palette } = useTheme();
  const [config, setConfig] = useState(loadConfig);
  const [yamlText, setYamlText] = useState("");
  const [viewMode, setViewMode] = useState<"form" | "yaml">("form");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setYamlText(yaml.dump(config, { indent: 2, lineWidth: 80 }));
  }, [config]);

  const handleSave = () => {
    try {
      if (viewMode === "yaml") {
        const parsed = yaml.load(yamlText);
        if (parsed && typeof parsed === "object") {
          setConfig(parsed as typeof DEFAULT_CONFIG);
          localStorage.setItem(STORAGE_KEY, yamlText);
        }
      } else {
        const dumped = yaml.dump(config, { indent: 2, lineWidth: 80 });
        localStorage.setItem(STORAGE_KEY, dumped);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* noop */ }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
    background: hexToRgba(palette.background, 0.6),
    color: palette.text,
    fontSize: 13,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: palette.textMuted,
    marginBottom: 3,
    display: "block",
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: palette.text, display: "flex", alignItems: "center", gap: 8 }}>
          <FileCode size={16} />
          Email Configuration
        </h3>
        <div style={{ display: "flex", gap: 4 }}>
          {(["form", "yaml"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "none",
                background: viewMode === mode ? hexToRgba(palette.primary, 0.15) : "transparent",
                color: viewMode === mode ? palette.primary : palette.textMuted,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {mode === "form" ? "Form" : "YAML"}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "form" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 600 }}>
          <div>
            <label style={labelStyle}>SMTP Host</label>
            <input
              value={config.smtp.host}
              onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, host: e.target.value } })}
              style={inputStyle}
              placeholder="smtp.example.com"
            />
          </div>
          <div>
            <label style={labelStyle}>SMTP Port</label>
            <input
              value={config.smtp.port}
              onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, port: Number(e.target.value) || 587 } })}
              style={inputStyle}
              type="number"
            />
          </div>
          <div>
            <label style={labelStyle}>SMTP Username</label>
            <input
              value={config.smtp.auth.user}
              onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, auth: { ...config.smtp.auth, user: e.target.value } } })}
              style={inputStyle}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label style={labelStyle}>SMTP Password</label>
            <input
              value={config.smtp.auth.pass}
              onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, auth: { ...config.smtp.auth, pass: e.target.value } } })}
              style={inputStyle}
              type="password"
              placeholder="password"
            />
          </div>
          <div>
            <label style={labelStyle}>From Address</label>
            <input
              value={config.defaults.from}
              onChange={(e) => setConfig({ ...config, defaults: { ...config.defaults, from: e.target.value } })}
              style={inputStyle}
              placeholder="noreply@example.com"
            />
          </div>
          <div>
            <label style={labelStyle}>Reply-To</label>
            <input
              value={config.defaults.replyTo}
              onChange={(e) => setConfig({ ...config, defaults: { ...config.defaults, replyTo: e.target.value } })}
              style={inputStyle}
              placeholder="support@example.com"
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Subject Prefix</label>
            <input
              value={config.defaults.subject_prefix}
              onChange={(e) => setConfig({ ...config, defaults: { ...config.defaults, subject_prefix: e.target.value } })}
              style={inputStyle}
            />
          </div>
        </div>
      ) : (
        <textarea
          value={yamlText}
          onChange={(e) => setYamlText(e.target.value)}
          style={{
            width: "100%",
            minHeight: 240,
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
            background: hexToRgba(palette.background, 0.6),
            color: palette.text,
            fontSize: 13,
            fontFamily: "monospace",
            outline: "none",
            resize: "vertical",
            lineHeight: 1.5,
          }}
        />
      )}

      <button
        onClick={handleSave}
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 20px",
          borderRadius: 8,
          border: "none",
          background: saved ? hexToRgba(palette.secondary, 0.2) : hexToRgba(palette.primary, 0.15),
          color: saved ? palette.secondary : palette.text,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <Save size={14} />
        {saved ? "Saved" : "Save Configuration"}
      </button>
    </div>
  );
}
