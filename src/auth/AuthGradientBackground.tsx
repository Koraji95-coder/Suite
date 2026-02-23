// src/auth/AuthGradientBackground.tsx
// Animated Gradient Glass background for auth pages
import { useEffect, useRef } from "react";

export default function AuthGradientBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let running = true;

    // Animate gradient angle and stops
    function animate() {
      if (!running) return;
      frame++;
      const angle = 110 + 20 * Math.sin(frame / 180);
      const gold = "var(--gold)";
      const silver = "var(--silver)";
      const rose = "var(--rose)";
      el.style.background = `linear-gradient(${angle}deg, ${gold} 0%, var(--white-faint) 36%, ${silver} 62%, ${rose} 100%)`;
      el.style.filter = "blur(32px) saturate(140%)";
      requestAnimationFrame(animate);
    }
    animate();
    return () => {
      running = false;
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.85,
        transition: "opacity 0.5s",
      }}
      className="auth-gradient-bg"
    />
  );
}
