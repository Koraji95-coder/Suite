import React from "react";
import { useTheme, hexToRgba, type ColorScheme } from "@/lib/palette";
import { logger } from "@/lib/logger";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  palette: ColorScheme;
}

class ErrorBoundaryInner extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error with full context
    logger.error(
      'Caught error in ErrorBoundary',
      'ErrorBoundary',
      error
    );
    
    // Log component stack for debugging
    if (errorInfo.componentStack) {
      logger.debug(
        'Component stack trace',
        'ErrorBoundary',
        { componentStack: errorInfo.componentStack }
      );
    }

    // Update state with error info
    this.setState({ errorInfo });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { palette } = this.props;
    const isDev = import.meta.env.DEV;

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
            maxWidth: 600,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 13, color: palette.textMuted, marginBottom: 16 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          
          {isDev && this.state.error?.stack && (
            <details style={{ 
              marginBottom: 16, 
              textAlign: "left",
              fontSize: 11,
              fontFamily: "monospace",
              background: hexToRgba(palette.background, 0.5),
              padding: 12,
              borderRadius: 8,
              maxHeight: 200,
              overflow: "auto"
            }}>
              <summary style={{ cursor: "pointer", marginBottom: 8, fontSize: 12 }}>
                Stack Trace
              </summary>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}

          <button
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null });
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
