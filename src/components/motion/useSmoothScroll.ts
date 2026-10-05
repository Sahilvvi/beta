import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/**
 * Site-wide smooth scrolling (Lenis) for marketing pages. Native scroll
 * positions are kept, so Framer's useScroll, the StackPanels coverage pass
 * and every pinned chapter keep working unchanged.
 *
 * `enabled` lets a page hold it back while something else owns scroll input
 * (the homepage intro intercepts wheel/touch until it hands over).
 *
 * Stays on with prefers-reduced-motion by product decision, with a firmer
 * lerp so it settles faster.
 */
let activeLenis: Lenis | null = null;

/** Scroll to a position or element, going through Lenis when it's running. */
export function smoothScrollTo(target: number | HTMLElement, immediate = false) {
  if (activeLenis) activeLenis.scrollTo(target, immediate ? { immediate: true } : { duration: 1.4 });
  else if (typeof target === 'number') window.scrollTo({ top: target, behavior: 'smooth' });
  else target.scrollIntoView({ behavior: 'smooth' });
}

export function useSmoothScroll(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lenis = new Lenis({ lerp: reduce ? 0.14 : 0.09, wheelMultiplier: 0.95 });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    activeLenis = lenis;
    if (import.meta.env.DEV) (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      if (activeLenis === lenis) activeLenis = null;
    };
  }, [enabled]);
}
