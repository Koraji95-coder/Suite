import React, { useState, useEffect } from "react";
import { useTheme, hexToRgba } from "@/lib/palette";

function formatTime() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function StatusBar() {
  const { palette, schemeKey } = useTheme();
  const [time, setTime] = useState(formatTime);

  useEffect(() => {
    const interval = setInterval(() => setTime(formatTime()), 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        height: 24,
        minHeight: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        background: palette.background,
        borderTop: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
        fontSize: 11,
        color: palette.textMuted,
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>{time}</span>
        <button
          style={{
            background: "none",
            border: "none",
            color: palette.textMuted,
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = palette.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = palette.textMuted;
          }}
        >
          {schemeKey}
        </button>
      </div>
      <span>Guest</span>
    </div>
  );
}
