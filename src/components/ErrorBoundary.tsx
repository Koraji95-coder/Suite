import React from "react";
import { useTheme, hexToRgba, type ColorScheme } from "@/lib/palette";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  palette: ColorScheme;
}

class ErrorBoundaryInner extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { palette } = this.props;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 16,
          padding: 32,
          color: palette.text,
        }}
      >
        <div
          style={{
            padding: "24px 32px",
            borderRadius: 12,
            background: hexToRgba(palette.surface, 0.8),
            border: `1px solid ${hexToRgba(palette.accent, 0.3)}`,
            textAlign: "center",
            maxWidth: 480,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 13, color: palette.textMuted, marginBottom: 16 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: palette.primary,
              color: palette.background,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  return <ErrorBoundaryInner palette={palette}>{children}</ErrorBoundaryInner>;
}
