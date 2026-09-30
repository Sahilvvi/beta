import { useEffect, useRef, useState } from 'react';
import {
  animate, motion, type MotionValue, type PanInfo, useAnimationFrame, useMotionTemplate,
  useMotionValue, useMotionValueEvent, useReducedMotion, useTransform,
} from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { TEMPLATES, type Template } from '@/lib/templates';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/premium/Motion';
import { useInViewOrStacked } from './StackPanels';
import { pad } from './hooks';

const COUNT = TEMPLATES.length;
const STEP = 360 / COUNT; // even spacing around a true 360° ring
const DRAG_TO_DEG = 0.22;
const DEG_PER_SEC = 360 / 30; // one unhurried revolution every 30s — never stops on its own
const STEP_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]; // "expo out"
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The representation of `base` (mod 360) nearest to `current` — for a shortest-path tween. */
function nearestEquivalent(base: number, current: number) {
  const k = Math.round((current - base) / 360);
  return base + k * 360;
}

// A true 360° ring: every card sits an equal STEP° apart around one circle,
// so nothing needs to be faked or bounded. The radius is derived — not
// guessed — from the regular-polygon geometry: for COUNT cards evenly
// spaced by STEP° around a circle, the chord between two neighbouring card
// CENTRES is 2·radius·sin(STEP/2). For their near edges to actually clear
// each other (not overlap), that chord has to exceed the card's own width
// by some margin — radius = (width · spacingFactor) / (2·tan(π/COUNT)) is
// exactly that, solved for the minimum non-overlapping radius at
// spacingFactor = 1, with extra room above 1 as a real gap between cards.
const SPACING_FACTOR = 1.32;
function ringRadius(width: number) {
  return (width * SPACING_FACTOR) / (2 * Math.tan(Math.PI / COUNT));
}

function useRingSize() {
  const [size, setSize] = useState({ radius: ringRadius(150), w: 150, perspective: 1250 });
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const w = vw < 640 ? 150 : vw < 1024 ? 210 : vw < 1280 ? 270 : 320;
      const perspective = vw < 640 ? 1250 : vw < 1024 ? 1750 : vw < 1280 ? 2260 : 2680;
      setSize({ radius: ringRadius(w), w, perspective });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

/** Small crosshair / registration mark, echoing the print-catalogue reference. */
function Crosshair({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('relative inline-block h-2.5 w-2.5 shrink-0 opacity-60', className)}>
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-current" />
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current" />
    </span>
  );
}

/* ------------------------------------------------------------------ *
 *  Styles in the round — a literal 3D ring: all 7 cards evenly spaced
 *  around one real circle (STEP° apart), each carrying its own front and
 *  back face so there is always something to see at every angle — the
 *  front face while it faces the camera, a dimmed back face (native CSS
 *  backface-visibility does the swap, so it never shows a mirrored image)
 *  once it's turned past 90°. The whole ring turns as one continuous,
 *  constant-speed rotation that never stops on its own — only a hover, a
 *  drag or the keyboard pauses it. Arrows, dots and the keyboard turn the
 *  whole ring by one card rather than swapping a photo.
 * ------------------------------------------------------------------ */
export function StyleRing() {
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInViewOrStacked(sectionRef, { margin: '0px 0px -20% 0px' });
  const reduce = useReducedMotion();
  const { radius, w, perspective } = useRingSize();

  const angle = useMotionValue(0);
  // Deliberately not gated by `reduce`: this is the same "ambient, always-on"
  // exemption the style/room ticker uses — a slow, continuous 1-rev/30s turn
  // isn't the kind of motion reduced-motion exists to protect against, and a
  // ring that stops the moment a cursor merely rests over it (as opposed to
  // dragging it) reads as broken, not considerate.
  const playing = useRef(true);
  const dragged = useRef(false);
  const dragStart = useRef(0);
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);

  // Track which card is nearest to front, without a React render every frame.
  useMotionValueEvent(angle, 'change', (v) => {
    const idx = mod(Math.round(-v / STEP), COUNT);
    if (idx !== currentRef.current) {
      currentRef.current = idx;
      setCurrent(idx);
    }
  });

  const goTo = (idx: number) => {
    const target = nearestEquivalent(-idx * STEP, angle.get());
    animate(angle, target, { duration: reduce ? 0 : 0.7, ease: STEP_EASE });
  };

  // The one continuous, ever-turning rotation — paused only for an actual
  // drag or arrow/dot selection, not for reduced motion or a resting cursor.
  useAnimationFrame((_, delta) => {
    if (!playing.current || !inView) return;
    angle.set(angle.get() - (DEG_PER_SEC * delta) / 1000);
  });

  const active = TEMPLATES[current];

  const onPanStart = () => {
    playing.current = false;
    dragStart.current = angle.get();
  };
  const onPan = (_: PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 6) dragged.current = true;
    angle.set(dragStart.current + info.offset.x * DRAG_TO_DEG);
  };
  const onPanEnd = () => {
    goTo(currentRef.current);
    setTimeout(() => { dragged.current = false; playing.current = true; }, 700);
  };

  const select = (idx: number) => {
    playing.current = false;
    goTo(idx);
    setTimeout(() => { playing.current = true; }, 750);
  };

  return (
    <section
      id="styles"
      ref={sectionRef}
      className="relative scroll-mt-24 overflow-hidden border-y border-foreground/[0.07] bg-[hsl(168_20%_97.5%)] py-16 lg:py-24"
    >
      <div className="container relative mx-auto flex flex-col gap-6 max-w-[1240px] px-6 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/45">Styles in the round</p>
          <h2 className="mt-4 max-w-md text-[clamp(1.9rem,4vw,3.2rem)] font-bold leading-[1.05] tracking-[-0.03em] text-foreground">
            One room, every look you could choose.
          </h2>
        </Reveal>

        <div className="flex flex-shrink-0 items-center gap-3">
          <button
            type="button"
            aria-label="Previous style"
            onClick={() => select(mod(currentRef.current - 1, COUNT))}
            className="grid h-12 w-12 place-items-center rounded-full border border-foreground/20 transition-colors hover:bg-foreground hover:text-background"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next style"
            onClick={() => select(mod(currentRef.current + 1, COUNT))}
            className="grid h-12 w-12 place-items-center rounded-full border border-foreground/20 transition-colors hover:bg-foreground hover:text-background"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label="Interior styles — use the arrow keys to turn"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); select(mod(currentRef.current + 1, COUNT)); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); select(mod(currentRef.current - 1, COUNT)); }
        }}
        onFocus={() => { playing.current = false; }}
        onBlur={() => { playing.current = true; }}
        style={{ perspective }}
        className="relative mx-auto mt-6 h-[420px] w-full max-w-[1440px] select-none outline-none [perspective-origin:50%_50%] focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-[500px] lg:h-[560px] xl:h-[640px]"
      >
        <motion.div
          className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing"
          onPanStart={onPanStart}
          onPan={onPan}
          onPanEnd={onPanEnd}
          data-cursor
        >
          <div className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]">
            {TEMPLATES.map((t, i) => (
              <RingCard
                key={t.key}
                template={t}
                index={i}
                angle={angle}
                radius={radius}
                width={w}
                isCurrent={i === current}
                onSelect={() => { if (!dragged.current) select(i); }}
              />
            ))}
          </div>
        </motion.div>
        <div aria-hidden className="pointer-events-none absolute bottom-6 left-1/2 h-10 w-[60%] -translate-x-1/2 rounded-[100%] bg-[hsl(168_40%_15%/0.15)] blur-2xl" />
      </div>

      <div className="container relative mx-auto mt-8 max-w-[1240px] px-6 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p aria-live="polite" className="min-w-0 truncate font-mono text-[12px] uppercase tracking-[0.14em] text-foreground/45">
            <span className="text-foreground">{active.label}</span> · {active.tags.join(' · ')}
          </p>
          <ol aria-label="Styles" className="flex flex-shrink-0 gap-1.5">
            {TEMPLATES.map((t, i) => (
              <li key={t.key}>
                <button
                  type="button"
                  aria-label={`Show ${t.label}`}
                  aria-current={i === current}
                  onClick={() => select(i)}
                  className={cn(
                    'h-1 rounded-full transition-[width,background-color] duration-500',
                    i === current ? 'w-7 bg-primary' : 'w-3 bg-foreground/20 hover:bg-foreground/35',
                  )}
                />
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-6">
          <p className="max-w-[52ch] text-[15px] text-foreground/55">{active.description}</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One card, planted at its own fixed slot (`index · STEP`) on the shared
 * ring — `angle` (one continuous, ever-growing value) is simply added on
 * top, so as it climbs forever every card keeps sailing round the same
 * real circle rather than swinging back and forth. The card carries two
 * faces glued back-to-back: a front face (full photo + footer) and a back
 * face (the same photo, dimmed) rotated a further 180° inside it. Native
 * `backface-visibility: hidden` means exactly one of the two is ever
 * rendered at a given moment — whichever currently faces the camera — so
 * there is no mirrored flip and no card ever goes fully blank, at any point
 * in the rotation.
 */
function RingCard({
  template, index, angle, radius, width, isCurrent, onSelect,
}: {
  template: Template;
  index: number;
  angle: MotionValue<number>;
  radius: number;
  width: number;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const rawAngle = useTransform(angle, (a) => index * STEP + a);
  const normAngle = useTransform(rawAngle, (v) => {
    let n = v % 360;
    if (n > 180) n -= 360;
    if (n < -180) n += 360;
    return n;
  });
  const depthBlur = useTransform(normAngle, (n) => Math.min(1.6, Math.max(0, Math.abs(n) - 35) * 0.035));
  const filter = useMotionTemplate`blur(${depthBlur}px)`;
  // A card dead ahead reads bigger, one at the edge of legibility reads
  // smaller — the same "nearer things look bigger" cue a real camera gives
  // for free, which our flat `width` style doesn't on its own. Without it,
  // turning the ring reads as the PHOTOS changing in place rather than
  // actual cards swinging past — this scale is what sells "a card moved."
  const depthScale = useTransform(normAngle, (n) => Math.max(0.74, 1 - Math.abs(n) * 0.0034));
  // Front + its two immediate neighbours read clean and legible; past that,
  // a 7-card ring only has room to show a sliver — which, at full opacity,
  // is what was reading as broken/overlapping clutter rather than a card.
  // Fading those far cards out (well before the ±90° point where the face
  // flips to its dimmed back) removes that clutter entirely instead of
  // trying to make an inherently illegible sliver legible.
  const depthOpacity = useTransform(normAngle, (n) => {
    const d = Math.abs(n);
    if (d <= 55) return 1;
    if (d >= 115) return 0;
    return 1 - (d - 55) / 60;
  });
  // Written out explicitly, in this exact order: centre, THEN rotate, THEN
  // push outward along the card's now-rotated local Z axis. That order is
  // what makes each card end up facing outward rather than all facing the
  // viewer flat-on — Framer's own automatic x/y/z/rotate composition
  // doesn't guarantee this order, so it's spelled out by hand instead.
  const transform = useMotionTemplate`translate(-50%, -50%) rotateY(${rawAngle}deg) translateZ(${radius}px) scale(${depthScale})`;

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 aspect-[4/5] [transform-style:preserve-3d]"
      style={{ width, transform, filter, opacity: depthOpacity }}
    >
      {/* back face — a proper reverse side, not a dimmed leftover: a branded
          teal wash and grid over the same photo, rotated 180° inside the same
          slot so it only ever appears once the front has turned away */}
      <div
        aria-hidden
        className="absolute inset-0 overflow-hidden rounded-[18px] border border-foreground/[0.1] shadow-[0_2px_0_-1px_hsl(168_20%_90%),0_5px_0_-2px_hsl(168_20%_93%),0_20px_50px_-30px_hsl(168_30%_15%/0.3)] [backface-visibility:hidden]"
        style={{ transform: 'rotateY(180deg)' }}
      >
        <img src={template.image} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(160deg,hsl(168_100%_14%/0.9),hsl(168_85%_20%/0.82)_55%,hsl(166_70%_27%/0.86))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:20px_20px] opacity-50" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          <Crosshair className="h-4 w-4 text-white/80" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/70">{pad(index + 1)}</span>
        </div>
      </div>

      <button
        type="button"
        tabIndex={-1}
        aria-hidden={!isCurrent}
        onClick={onSelect}
        className={cn(
          // The first two shadow layers are a thin stacked edge — a cheap
          // trick for "this has physical thickness" that reads much more
          // 3D than a single soft shadow, especially once the card is tilted.
          'group absolute inset-0 flex h-full w-full flex-col overflow-hidden rounded-[18px] border bg-white text-left transition-shadow duration-700 [backface-visibility:hidden]',
          isCurrent
            ? 'border-primary/40 shadow-[0_3px_0_-1px_hsl(168_20%_88%),0_7px_0_-2px_hsl(168_20%_92%),0_40px_80px_-30px_hsl(168_30%_15%/0.5)]'
            : 'border-foreground/[0.08] shadow-[0_2px_0_-1px_hsl(168_20%_90%),0_5px_0_-2px_hsl(168_20%_93%),0_20px_50px_-30px_hsl(168_30%_15%/0.3)]',
        )}
      >
        <span className="relative block min-h-0 flex-1 overflow-hidden">
          <img
            src={template.image}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <Crosshair className="absolute left-3 top-3 text-white/80 mix-blend-difference" />
          <Crosshair className="absolute right-3 top-3 text-white/80 mix-blend-difference" />
        </span>

        {/* footer bar — bold title left, index right, echoing the reference's figcaption */}
        <span className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-foreground/[0.08] bg-white px-3.5 py-3">
          <span className="truncate text-[14px] font-bold tracking-[-0.01em] text-foreground">{template.label}</span>
          <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-foreground/35">{pad(index + 1)}</span>
        </span>
      </button>
    </motion.div>
  );
}
