// Polyfill GestureEvent for non-Safari browsers (required by @react-three/fiber v9+)
if (typeof window !== 'undefined' && !('GestureEvent' in window)) {
  (window as any).GestureEvent = class GestureEvent extends UIEvent {};
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
