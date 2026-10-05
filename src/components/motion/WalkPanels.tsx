import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Walk-through panels — the homepage's scroll mechanic: scrolling should feel
 * like walking through a home, room by room, so every section takes part:
 *
 *  1. Arrive — a section rises out of the room behind it (HouseTour's
 *     backdrop) with real perspective: tilted back and a little further away
 *     at the bottom of the screen, standing square by the time you're in it.
 *     The room behind falls out of focus while it's there.
 *  2. Depth — inside, headings drift a little slower than the scroll and
 *     photos drift inside their frames, so things read as near and far
 *     rather than one flat page.
 *  3. Leave — once you're past it, the section eases back into the room
 *     (tilts away, shrinks a touch, dims) and the room comes back into focus
 *     for the walk to the next doorway.
 *
 * One rAF-throttled scroll pass drives every panel. The panel itself gets the
 * perspective transform; inner elements only get the individual `scale` /
 * `translate` CSS properties, so they compose with Framer Motion's own
 * `transform` animations on the same content instead of fighting them.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

interface Depth { el: HTMLElement; off: number; h: number; amount: number; inner: boolean }
interface Panel { el: HTMLElement; content: HTMLElement; veil: HTMLElement; depth: Depth[] }

interface Ctx { register: (p: Panel) => () => void }
const WalkCtx = createContext<Ctx | null>(null);

/** Elements that drift with depth: headings sit "further away", photos drift inside their frames. */
function collectDepth(panel: HTMLElement): Depth[] {
  const out: Depth[] = [];
  const pr = panel.getBoundingClientRect();
  const nodes = panel.querySelectorAll<HTMLElement>('h1, h2, img, video, [data-depth]');
  nodes.forEach((el) => {
    if (out.length >= 28 || el.closest('[data-no-depth]')) return;
    el.style.translate = '';
    const r = el.getBoundingClientRect();
    if (r.height < 24) return;
    const tag = el.tagName;
    const media = tag === 'IMG' || tag === 'VIDEO';
    const parent = el.parentElement;
    // a photo inside a clipping frame drifts within the frame (scaled up a touch so no edge shows)
    const inner = media && !!parent && getComputedStyle(parent).overflow !== 'visible' && r.width > 120;
    const custom = el.dataset.depth ? Number(el.dataset.depth) : null;
    const amount = custom ?? (media ? (inner ? 1 : 0) : -0.55);
    if (!amount) return;
    if (inner) el.style.scale = '1.1';
    out.push({ el, off: r.top - pr.top, h: r.height, amount, inner });
  });
  return out;
}

export function WalkGroup({ children, className }: { children: ReactNode; className?: string }) {
  const panels = useRef<Panel[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    const update = () => {
      raf.current = 0;
      const H = window.innerHeight;
      const W = window.innerWidth;
      for (const p of panels.current) {
        const r = p.el.getBoundingClientRect();
        if (r.bottom < -H * 0.2 || r.top > H * 1.2) continue;

        // 1 · arrive: the section rises out of the room towards you — tilted back at the
        //     bottom of the screen, standing up square by the time its top is a third of the way up
        const enter = smooth(clamp01((H - r.top) / (H * 0.7)));
        // 3 · leave: once its bottom passes the middle of the screen it eases back into the room
        const leave = smooth(clamp01((H * 0.5 - r.bottom) / (H * 0.5)));
        const tilt = (1 - enter) * 9 - leave * 5;
        const scale = (0.9 + 0.1 * enter) * (1 - 0.05 * leave);
        p.el.style.transformOrigin = `50% ${leave > 0 ? '100%' : '0%'}`;
        p.el.style.transform = enter > 0.999 && leave < 0.001
          ? ''
          : `perspective(1600px) rotateX(${tilt.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
        p.el.style.opacity = (0.88 + 0.12 * enter - 0.2 * leave).toFixed(3);
        p.veil.style.opacity = (leave * 0.35).toFixed(3);
        void W;

        // 2 · depth: offset from the middle of the screen, -1 (above) … 1 (below)
        for (const d of p.depth) {
          const c = (r.top + d.off + d.h / 2 - H / 2) / H;
          if (c < -1.4 || c > 1.4) continue;
          if (d.inner) d.el.style.translate = `0 ${(-c * d.h * 0.045).toFixed(1)}px`;
          else d.el.style.translate = `0 ${(c * d.amount * 42).toFixed(1)}px`;
        }
      }
    };
    const onScroll = () => { if (!raf.current) raf.current = requestAnimationFrame(update); };
    const relayout = () => {
      panels.current.forEach((p) => { p.depth = collectDepth(p.content); });
      onScroll();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', relayout);
    const ro = new ResizeObserver(() => relayout());
    panels.current.forEach((p) => ro.observe(p.content));
    // content (images, lazy sections, fonts) keeps settling for a moment after mount
    const t1 = window.setTimeout(relayout, 600);
    const t2 = window.setTimeout(relayout, 2000);
    relayout();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', relayout);
      ro.disconnect();
      window.clearTimeout(t1); window.clearTimeout(t2);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const register = (p: Panel) => {
    panels.current = [...panels.current, p];
    return () => { panels.current = panels.current.filter((x) => x !== p); };
  };

  return (
    <WalkCtx.Provider value={{ register }}>
      <div className={cn('flex flex-col gap-4', className)}>{children}</div>
    </WalkCtx.Provider>
  );
}

export function WalkPanel({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLSpanElement>(null);
  const ctx = useContext(WalkCtx);
  const fallbackId = useId();

  useLayoutEffect(() => {
    if (!ctx || !ref.current || !contentRef.current || !veilRef.current) return;
    return ctx.register({ el: ref.current, content: contentRef.current, veil: veilRef.current, depth: [] });
  }, [ctx]);

  return (
    <section
      ref={ref}
      id={id ?? fallbackId}
      className={cn(
        'walk-panel relative isolate overflow-hidden rounded-[28px] bg-background will-change-transform',
        // lifts the section off the room behind it
        'shadow-[0_50px_120px_-40px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.06)]',
        className,
      )}
    >
      <div ref={contentRef} className="relative will-change-[scale]">{children}</div>
      <span ref={veilRef} aria-hidden className="pointer-events-none absolute inset-0 z-[90] rounded-[inherit] bg-[#001F1B] opacity-0" />
    </section>
  );
}
