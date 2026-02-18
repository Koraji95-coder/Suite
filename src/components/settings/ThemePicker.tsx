import { useTheme, hexToRgba, COLOR_SCHEMES } from "@/lib/palette";

export function ThemePicker() {
  const { palette, schemeKey, setScheme, schemeKeys } = useTheme();

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: palette.text, marginBottom: 12 }}>
        Color Theme
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {schemeKeys.map((key) => {
          const scheme = COLOR_SCHEMES[key];
          const isActive = key === schemeKey;
          return (
            <button
              key={key}
              onClick={() => setScheme(key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 10,
                border: isActive
                  ? `2px solid ${palette.primary}`
                  : `1px solid ${hexToRgba(palette.primary, 0.12)}`,
                background: isActive
                  ? hexToRgba(palette.primary, 0.1)
                  : hexToRgba(scheme.surface, 0.5),
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.borderColor = hexToRgba(palette.primary, 0.4);
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.borderColor = hexToRgba(palette.primary, 0.12);
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: scheme.background,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  padding: 4,
                  flexShrink: 0,
                  border: `1px solid ${hexToRgba(scheme.primary, 0.3)}`,
                }}
              >
                {[scheme.primary, scheme.secondary, scheme.tertiary, scheme.accent].map((c, i) => (
                  <span
                    key={i}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: c,
                    }}
                  />
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: palette.text }}>
                  {scheme.name}
                  {isActive && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: palette.primary, fontWeight: 700 }}>
                      ACTIVE
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 11,
                  color: palette.textMuted,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {scheme.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
