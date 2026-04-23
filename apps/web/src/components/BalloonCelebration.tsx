'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// react-confetti-boom renders a canvas and animates particles rising.
// We disable SSR so server render doesn't try to touch window/canvas.
const ConfettiBoom = dynamic(() => import('react-confetti-boom'), { ssr: false });

/**
 * Full-screen balloon / confetti celebration per SPEC §3.17.
 * Rendered as a fixed overlay; auto-dismisses after the animation.
 * Respects `prefers-reduced-motion` by showing nothing (SPEC §7.11).
 */
export function BalloonCelebration({ show, onDone }: { show: boolean; onDone: () => void }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!show) return;
    const timer = window.setTimeout(onDone, 4200);
    return () => window.clearTimeout(timer);
  }, [show, onDone]);

  if (!show || reducedMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden>
      <ConfettiBoom
        mode="boom"
        particleCount={80}
        shapeSize={20}
        deg={270}
        effectCount={2}
        effectInterval={800}
        spreadDeg={70}
        launchSpeed={1.4}
        colors={[
          '#2563eb', // primary blue
          '#10b981', // activated green
          '#f59e0b', // warning amber
          '#ec4899', // proposal pink
          '#a855f7', // conversation purple
          '#f97316', // researched orange
        ]}
      />
    </div>
  );
}
