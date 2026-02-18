import { useTheme, hexToRgba } from "@/lib/palette";
import { Workflow } from "lucide-react";

export function AutomationWorkflows() {
  const { palette } = useTheme();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          padding: "48px 40px",
          borderRadius: 16,
          background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.08)} 0%, ${hexToRgba(palette.surface, 0.6)} 100%)`,
          border: `1px solid ${hexToRgba(palette.primary, 0.18)}`,
          boxShadow: `0 8px 32px ${hexToRgba(palette.background, 0.5)}`,
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.2)} 0%, ${hexToRgba(palette.primary, 0.08)} 100%)`,
            border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
          }}
        >
          <Workflow size={36} color={palette.primary} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: palette.text,
              margin: 0,
            }}
          >
            Coming Soon
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: palette.textMuted,
              margin: 0,
            }}
          >
            Define calculation chains, report generation triggers, and
            integration pipelines.
          </p>
        </div>

        <div
          style={{
            marginTop: 8,
            padding: "8px 20px",
            borderRadius: 8,
            background: hexToRgba(palette.primary, 0.1),
            border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
            color: palette.primary,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase" as const,
          }}
        >
          Automation Workflows
        </div>
      </div>
    </div>
  );
}
