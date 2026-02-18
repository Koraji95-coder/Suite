import { useState, useEffect, useRef } from "react";
import { useTheme, hexToRgba, COLOR_SCHEMES } from "@/lib/palette";
import { useAuth } from "@/contexts/useAuth";
import { ChevronDown, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function usePersistentClock() {
  const [time, setTime] = useState(formatTime);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const syncToMinute = () => {
      setTime(formatTime());
      const now = new Date();
      const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

      if (intervalRef.current) clearInterval(intervalRef.current);

      setTimeout(() => {
        setTime(formatTime());
        intervalRef.current = setInterval(() => setTime(formatTime()), 60_000);
      }, msUntilNextMinute);
    };

    syncToMinute();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return time;
}

export function StatusBar() {
  const { palette, schemeKey, setScheme, schemeKeys } = useTheme();
  const { profile } = useAuth();
  const time = usePersistentClock();
  const { isOnline } = useOnlineStatus();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const displayName = profile?.display_name || "Dustin";
  const role = "Admin";

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

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
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>{time}</span>
        {!isOnline && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              color: palette.accent,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <WifiOff size={12} />
            Offline
          </span>
        )}
        <div style={{ position: "relative" }} ref={pickerRef}>
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            aria-label="Change theme"
            style={{
              background: "none",
              border: "none",
              color: palette.textMuted,
              fontSize: 11,
              cursor: "pointer",
              padding: "0 4px",
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = palette.primary; }}
            onMouseLeave={(e) => { if (!pickerOpen) e.currentTarget.style.color = palette.textMuted; }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: palette.primary,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            {palette.name}
            <ChevronDown size={10} />
          </button>

          {pickerOpen && (
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: 6,
                background: palette.surface,
                border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                borderRadius: 8,
                padding: 6,
                minWidth: 200,
                maxHeight: 320,
                overflowY: "auto",
                zIndex: 1000,
                boxShadow: `0 8px 24px ${hexToRgba(palette.background, 0.8)}`,
              }}
            >
              {schemeKeys.map((key) => {
                const scheme = COLOR_SCHEMES[key];
                const isActive = key === schemeKey;
                return (
                  <button
                    key={key}
                    onClick={() => { setScheme(key); setPickerOpen(false); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "6px 8px",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: isActive ? hexToRgba(palette.primary, 0.15) : "transparent",
                      color: isActive ? palette.text : palette.textMuted,
                      fontSize: 12,
                      textAlign: "left",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = hexToRgba(palette.surfaceLight, 0.5); }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      {[scheme.primary, scheme.secondary, scheme.tertiary].map((c, i) => (
                        <span
                          key={i}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: c,
                          }}
                        />
                      ))}
                    </div>
                    <span style={{ flex: 1 }}>{scheme.name}</span>
                    {isActive && (
                      <span style={{ color: palette.primary, fontSize: 10, fontWeight: 600 }}>
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: hexToRgba(palette.primary, 0.6), fontWeight: 600 }}>{role}</span>
        <span>{displayName}</span>
      </div>
    </div>
  );
}
