import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, useTheme, hexToRgba } from './lib/palette';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { WorkspaceShell } from './layouts/WorkspaceShell';
import { EmberSplash } from './data/EmberSplash';
import { ToastContainer } from './components/ui/ToastContainer';
import { ToastProvider } from './components/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useCoordinatesServiceStatus } from './hooks/useCoordinatesServiceStatus';

function AppInner() {
  const { palette } = useTheme();
  const [splashComplete, setSplashComplete] = useState(false);
  const [splashKey, setSplashKey] = useState(0);

  // Monitor Coordinates service and notify user of disconnects
  useCoordinatesServiceStatus();

  const replaySplash = () => {
    setSplashComplete(false);
    setSplashKey((k) => k + 1);
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'h' || e.key === 'H')) replaySplash();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      id="app-container"
      className="min-h-screen relative"
      style={{
        background: `linear-gradient(145deg, ${palette.surface} 0%, ${palette.background} 50%, ${palette.background} 100%)`,
      }}
    >
      {!splashComplete && (
        <EmberSplash key={splashKey} onComplete={() => setSplashComplete(true)} />
      )}

      {import.meta.env.DEV && splashComplete && (
        <button
          type="button"
          onClick={replaySplash}
          className="fixed bottom-4 left-4 z-[110] px-3 py-2 rounded-lg text-xs font-semibold bg-black/70 hover:bg-black/80 backdrop-blur"
          style={{
            color: hexToRgba(palette.text, 0.8),
            border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
          }}
          title="Replay splash (Ctrl+Shift+H)"
        >
          Replay splash
        </button>
      )}

      {splashComplete && <WorkspaceShell />}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ErrorBoundary>
          <AuthProvider>
            <NotificationProvider>
              <ToastProvider>
                <AppInner />
                <ToastContainer />
              </ToastProvider>
            </NotificationProvider>
          </AuthProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
