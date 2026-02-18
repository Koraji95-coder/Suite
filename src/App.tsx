import { useEffect, useState } from 'react';
import { DashboardShell } from './components/dashboard/DashboardShell';
import { EmberSplash } from './data/EmberSplash';
import { ToastProvider } from './components/ToastProvider';
import { EMBER_PALETTE, hexToRgba } from './lib/three/emberPalette';

function App() {
  const [splashComplete, setSplashComplete] = useState(false);
  const [splashKey, setSplashKey] = useState(0);

  const replaySplash = () => {
    setSplashComplete(false);
    setSplashKey((k) => k + 1);
  };

  // Dev convenience: allow replaying the splash without restarting the dev server.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Shift + H => replay Ember splash
      if (e.ctrlKey && e.shiftKey && (e.key === 'h' || e.key === 'H')) replaySplash();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ToastProvider>
      <div
        id="app-container"
        className="min-h-screen relative"
        style={{
          background: `linear-gradient(145deg, ${EMBER_PALETTE.surface} 0%, ${EMBER_PALETTE.background} 50%, ${EMBER_PALETTE.background} 100%)`,
        }}
      >
        {!splashComplete && <EmberSplash key={splashKey} onComplete={() => setSplashComplete(true)} />}

        {import.meta.env.DEV && splashComplete && (
          <button
            type="button"
            onClick={replaySplash}
            className="fixed bottom-4 left-4 z-[110] px-3 py-2 rounded-lg text-xs font-semibold bg-black/70 hover:bg-black/80 backdrop-blur"
            style={{
              color: hexToRgba(EMBER_PALETTE.text, 0.8),
              border: `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.25)}`,
            }}
            title="Replay splash (Ctrl+Shift+H)"
          >
            Replay splash
          </button>
        )}

        {splashComplete && <DashboardShell />}
      </div>
    </ToastProvider>
  );
}

export default App;