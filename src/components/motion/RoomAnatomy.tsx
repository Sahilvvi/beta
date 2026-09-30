import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInViewOrStacked } from './StackPanels';
import { Magnetic, Reveal } from '@/components/premium/Motion';
import { Tilt } from './primitives';

const BEFORE = '/assets/samples/empty_room.png';
const AFTER = '/assets/samples/styled_room.png';

type Spot = { key: string; label: string; kept?: boolean; x: number; y: number; note: string };

// Positions are percentages of the example photo.
const SPOTS: Spot[] = [
  { key: 'light', label: 'Cove lighting', x: 50, y: 12, note: 'Warm cove lights trace the ceiling that was already there.' },
  { key: 'panel', label: 'Wall panelling', x: 32, y: 42, note: 'Slatted oak panels frame a new media wall.' },
  { key: 'furniture', label: 'Furniture', x: 25, y: 70, note: 'Sofas, a lounge chair and a coffee table, arranged for the room.' },
  { key: 'textiles', label: 'Rug & textiles', x: 47, y: 86, note: 'A woven rug, cushions and throws pull the palette together.' },
  { key: 'plants', label: 'Plants & decor', x: 66, y: 42, note: 'Greenery, lamps and art finish the look.' },
  { key: 'windows', label: 'Windows', kept: true, x: 12, y: 44, note: 'Same glazing, same place — Mantha restyles your room, it does not rebuild it.' },
  { key: 'door', label: 'Door', kept: true, x: 92, y: 52, note: 'Doors and walls stay exactly where they are in your photo.' },
];

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/* ------------------------------------------------------------------ *
 *  Mantha AI — an example redesign with hotspots. Selecting one lifts a
 *  floating annotation card off the photo (real point, real note, right
 *  there on the image — not a separate zoomed-in circle nobody could
 *  read); details kept from the photo get an explicit Before/After
 *  toggle on the card instead of a tiny illegible split view.
 * ------------------------------------------------------------------ */
export function RoomAnatomy({ features }: { features: string[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInViewOrStacked(sectionRef, { margin: '0px 0px -15% 0px' });
  const reduce = useReducedMotion();
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const [sel, setSel] = useState(0);
  const [touched, setTouched] = useState(false);
  const [showBefore, setShowBefore] = useState(false);
  const spot = SPOTS[sel];

  useEffect(() => {
    if (touched || reduce || !inView) return;
    const id = setInterval(() => setSel((s) => (s + 1) % SPOTS.length), 3200);
    return () => clearInterval(id);
  }, [touched, reduce, inView]);

  useEffect(() => { setShowBefore(false); }, [sel]);

  const pick = (i: number) => {
    setTouched(true);
    setSel(i);
  };

  const pill = (s: Spot) => {
    const i = SPOTS.indexOf(s);
    return (
      <button
        key={s.key}
        type="button"
        onClick={() => pick(i)}
        aria-pressed={i === sel}
        className={cn(
          'rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-all duration-300',
          i === sel
            ? s.kept
              ? 'border-foreground bg-foreground text-background'
              : 'border-primary bg-primary text-primary-foreground'
            : 'border-foreground/[0.12] bg-white text-foreground/70 hover:border-primary/40 hover:text-primary',
        )}
      >
        {s.label}
      </button>
    );
  };

  return (
    <section id="mantha" ref={sectionRef} className="relative scroll-mt-24 overflow-hidden py-16 lg:py-24">
      {/* ambient grid + glow — same treatment as the generator and offer band,
          so this section stops reading as the one flat, undressed page on the site */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(hsl(168_30%_20%/0.04)_1px,transparent_1px),linear-gradient(90deg,hsl(168_30%_20%/0.04)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_75%_45%,#000,transparent)]" />
        <div className="absolute -right-32 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(168_100%_17%/0.08),transparent_65%)] blur-3xl" />
      </div>

      <div className="container relative mx-auto max-w-[1240px] px-6 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <Reveal>
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Mantha AI · Available now
              </p>
              <h2 className="mt-5 text-[clamp(2rem,4.4vw,3.6rem)] font-bold leading-[1.02] tracking-[-0.035em] text-foreground">
                One photo.
                <br />
                <span className="text-primary">Every layer</span> handled.
              </h2>
              <p className="mt-6 max-w-[44ch] text-[16px] leading-relaxed text-foreground/58">
                Mantha restyles your actual room. Furniture, finishes and light change; walls,
                windows and doors stay where they are. Tap a marker on the photo to see what
                changed.
              </p>
            </Reveal>

            <Reveal delay={0.1} className="mt-8">
              <div className="relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-white p-5 shadow-[0_18px_44px_-28px_hsl(168_30%_15%/0.3)]">
                <div
                  aria-hidden
                  className="shine-sweep pointer-events-none absolute inset-y-0 -left-1/4 w-1/4 -skew-x-12 bg-[linear-gradient(90deg,transparent,hsl(168_100%_17%/0.05),transparent)]"
                  style={{ animationDelay: '1.2s' }}
                />
                <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-foreground/40">Restyled by Mantha</p>
                <div className="mt-3 flex flex-wrap gap-2">{SPOTS.filter((s) => !s.kept).map(pill)}</div>
                <p className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.2em] text-foreground/40">Kept from your photo</p>
                <div className="mt-3 flex flex-wrap gap-2">{SPOTS.filter((s) => s.kept).map(pill)}</div>
                <div className="mt-5 min-h-[3.25rem] border-t border-foreground/[0.07] pt-4" aria-live="polite">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                      key={spot.key}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                      className="text-[14px] leading-relaxed text-foreground/65"
                    >
                      {spot.note}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.18} className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {features.map((f) => (
                <div
                  key={f}
                  className="group flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3.5 py-3 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/[0.04] hover:shadow-[0_14px_30px_-20px_hsl(168_30%_15%/0.4)]"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 transition-all duration-400 group-hover:scale-110 group-hover:bg-primary">
                    <Check className="h-3 w-3 text-primary transition-colors duration-400 group-hover:text-primary-foreground" />
                  </span>
                  <span className="text-[13.5px] text-foreground/68">{f}</span>
                </div>
              ))}
            </Reveal>

            <Reveal delay={0.26} className="mt-8">
              <Magnetic>
                <Link
                  to="/signup"
                  className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-primary px-7 py-3.5 text-[14.5px] font-semibold text-primary-foreground shadow-[0_14px_32px_-12px_hsl(168_100%_17%/0.45)] transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98]"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.25),transparent)] transition-transform duration-700 group-hover:translate-x-full"
                  />
                  <span className="relative">Try it on your room</span>
                  <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Magnetic>
            </Reveal>
          </div>

          <Reveal y={36} blur={16}>
            <Tilt max={6} innerClassName="rounded-[26px]">
              <div className="relative">
                <div className="relative overflow-hidden rounded-[26px] border border-foreground/[0.08] bg-white p-2.5 shadow-[0_40px_90px_-36px_hsl(168_30%_12%/0.4)]">
                  <div ref={boxRef} className="relative aspect-[852/338]">
                    {/* image + sweep live in their own clipped layer so the rounded corners stay
                        crisp — the markers and floating card below sit OUTSIDE this clip, so
                        they can pop past the edge instead of being cut off mid-card */}
                    <div className="absolute inset-0 overflow-hidden rounded-[18px]">
                      <img
                        src={AFTER}
                        alt="Example redesign of a living room in the Modern style"
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <AnimatePresence>
                        {spot.kept && showBefore && (
                          <motion.img
                            key="before"
                            src={BEFORE}
                            alt="The same spot in your original photo"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.45 }}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        )}
                      </AnimatePresence>
                      <div
                        aria-hidden
                        className="shine-sweep pointer-events-none absolute inset-y-0 -left-1/4 z-10 w-1/4 -skew-x-12 bg-[linear-gradient(90deg,transparent,hsl(0_0%_100%/0.4),transparent)] mix-blend-overlay"
                        style={{ animationDelay: '2.4s' }}
                      />
                    </div>

                    <span
                      className="absolute left-4 top-4 z-10 rounded-full border border-white/15 bg-ink/60 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md transition-colors duration-300"
                      style={{ transform: 'translateZ(30px)' }}
                    >
                      {spot.kept && showBefore ? 'Before · Your photo' : 'After · Mantha'}
                    </span>
                    <span
                      className="absolute right-4 top-4 z-10 rounded-full border border-primary/40 bg-primary/85 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground backdrop-blur-md"
                      style={{ transform: 'translateZ(30px)' }}
                    >
                      {sel + 1} / {SPOTS.length}
                    </span>

                    {SPOTS.map((s, i) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => pick(i)}
                        aria-label={s.kept ? `${s.label} (kept from your photo)` : s.label}
                        aria-pressed={i === sel}
                        className="absolute z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                        style={{ left: `${s.x}%`, top: `${s.y}%` }}
                      >
                        <span
                          className={cn(
                            'relative block h-4 w-4 rounded-full border-2 border-white shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out',
                            s.kept ? 'bg-foreground' : 'bg-primary',
                          )}
                          style={{ transform: i === sel ? 'translateZ(26px) scale(1.35)' : 'translateZ(0px) scale(1)' }}
                        >
                          {i === sel && !reduce && (
                            <span className="absolute -inset-2 animate-ping rounded-full border border-white/80" />
                          )}
                        </span>
                      </button>
                    ))}

                    <AnimatePresence mode="wait">
                      {box.w > 0 && (
                        <SpotCard
                          key={spot.key}
                          spot={spot}
                          w={box.w}
                          h={box.h}
                          showBefore={showBefore}
                          onToggleBefore={setShowBefore}
                        />
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/45">
                    <span>Example redesign · Modern</span>
                    <span className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Restyled</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-foreground" />Kept</span>
                    </span>
                  </div>
                </div>

                {/* soft ground shadow reinforcing the tilt/lift, same trick the generator's card uses */}
                <div aria-hidden className="pointer-events-none absolute inset-x-[10%] -bottom-4 -z-10 h-8 rounded-[50%] bg-[hsl(168_40%_15%/0.16)] blur-2xl" />
              </div>
            </Tilt>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * The annotation itself — a real card lifted off the photo right beside
 * the marker that opened it, not a separate zoomed circle you had to
 * decode. Kept details carry their own Before/After toggle so proving
 * "this didn't move" is one click on the full photo, not a squint at a
 * 90px split view.
 */
function SpotCard({
  spot, w, h, showBefore, onToggleBefore,
}: {
  spot: Spot;
  w: number;
  h: number;
  showBefore: boolean;
  onToggleBefore: (v: boolean) => void;
}) {
  const cardW = 224;
  const sx = (spot.x / 100) * w;
  const sy = (spot.y / 100) * h;
  const onRight = spot.x < 55;
  const left = onRight ? Math.min(sx + 26, w - cardW - 6) : Math.max(sx - 26 - cardW, 6);
  const top = Math.min(Math.max(sy - 56, 6), h - 128);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: 10 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="absolute z-20"
      style={{ left, top, width: cardW }}
    >
      <div className="rounded-2xl border border-foreground/10 bg-white/95 p-3.5 shadow-[0_20px_46px_-18px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-foreground/40">
          <span className={cn('h-1.5 w-1.5 rounded-full', spot.kept ? 'bg-foreground' : 'bg-primary')} />
          {spot.kept ? 'Kept from your photo' : 'Restyled by Mantha'}
        </span>
        <p className="mt-1.5 text-[13.5px] font-bold tracking-[-0.01em] text-foreground">{spot.label}</p>
        <p className="mt-1 text-[12px] leading-snug text-foreground/60">{spot.note}</p>

        {spot.kept && (
          <div className="mt-3 flex gap-1.5 border-t border-foreground/[0.07] pt-3">
            {(['After', 'Before'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onToggleBefore(t === 'Before')}
                className={cn(
                  'flex-1 rounded-full py-1.5 text-[11px] font-semibold transition-colors duration-200',
                  (t === 'Before') === showBefore
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/[0.06] text-foreground/55 hover:bg-foreground/[0.1]',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
