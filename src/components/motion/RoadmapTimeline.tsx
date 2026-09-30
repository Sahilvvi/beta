import { useRef } from 'react';
import { Camera, CheckCircle2, FileDown, Ruler, ScanLine, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/premium/Motion';
import { Tilt } from './primitives';

type Stage = { key: string; icon: LucideIcon; label: string; note: string; status: 'live' | 'soon' };

const STAGES: Stage[] = [
  { key: 'photo', icon: Camera, label: 'Photo redesigns', note: 'Upload a photo, pick a style — a finished room in seconds.', status: 'live' },
  { key: 'scan', icon: ScanLine, label: 'Room scanning', note: 'Walk a room once with your phone to capture it.', status: 'soon' },
  { key: 'plans', icon: Ruler, label: 'Measured plans', note: 'Wall lengths, room dimensions, doors and windows.', status: 'soon' },
  { key: 'export', icon: FileDown, label: 'Exports', note: 'Take the finished plan and design anywhere.', status: 'soon' },
];

/* ------------------------------------------------------------------ *
 *  Where Think Decor goes next — a centred header over a true vertical
 *  spine, stages alternating left and right of it on wide screens (one
 *  column, spine on the left, on phones). The spine's own fill tracks
 *  real scroll progress through the list, not a canned timer.
 * ------------------------------------------------------------------ */
export function RoadmapTimeline() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start 0.8', 'end 0.55'] });
  const fill = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });
  const shipped = STAGES.filter((s) => s.status === 'live').length;

  return (
    <section className="relative overflow-hidden py-16 lg:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(hsl(168_30%_20%/0.035)_1px,transparent_1px),linear-gradient(90deg,hsl(168_30%_20%/0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_60%_75%_at_50%_10%,#000,transparent)]" />
        <div className="absolute left-1/2 top-0 h-[24rem] w-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,hsl(168_100%_17%/0.06),transparent_65%)] blur-3xl" />
      </div>

      <div className="container relative mx-auto max-w-[1000px] px-6 sm:px-8">
        <Reveal className="mx-auto max-w-[640px] text-center">
          <p className="flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            On the roadmap
          </p>
          <h2 className="mx-auto mt-5 max-w-[22ch] text-[clamp(1.9rem,4vw,3.2rem)] font-bold leading-[1.08] tracking-[-0.03em] text-foreground">
            Where Think Decor goes next.
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-[15.5px] leading-relaxed text-foreground/55">
            Photo redesigns are live today. Room scanning, measured plans and exports are in development.
          </p>
          <p className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-primary">
            {shipped} of {STAGES.length} shipped
          </p>
        </Reveal>

        <div ref={trackRef} className="relative mt-16 sm:mt-20">
          {/* the spine — left edge on phones, dead centre from sm up; its fill tracks real scroll progress */}
          <div className="pointer-events-none absolute left-7 top-2 bottom-2 w-px -translate-x-1/2 bg-foreground/[0.1] sm:left-1/2">
            <motion.div
              className="w-full origin-top bg-gradient-to-b from-primary via-primary to-mint"
              style={{ scaleY: fill, boxShadow: '0 0 12px -1px hsl(162 72% 46% / 0.5)' }}
            />
            {/* a small light constantly travelling the spine — motion that reads as "always live", not just a one-time fill */}
            {!reduce && (
              <motion.span
                aria-hidden
                className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-mint shadow-[0_0_10px_2px_hsl(162_72%_46%/0.7)]"
                animate={{ top: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'linear', delay: 0.5 }}
              />
            )}
          </div>

          <ul className="flex flex-col gap-12 sm:gap-4">
            {STAGES.map((s, i) => {
              const Icon = s.icon;
              const live = s.status === 'live';
              const onRight = i % 2 === 1;
              return (
                <li key={s.key} className="relative sm:grid sm:grid-cols-2 sm:items-center sm:gap-x-16 sm:py-8">
                  <div className="absolute left-7 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 sm:left-1/2">
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      whileInView={{ scale: 1, opacity: 1 }}
                      viewport={{ once: true, margin: '0px 0px -15% 0px' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 20, delay: i * 0.06 }}
                      className={cn(
                        'relative flex h-14 w-14 items-center justify-center rounded-2xl border shadow-sm',
                        live
                          ? 'border-primary/40 bg-primary text-primary-foreground shadow-[0_10px_30px_-8px_hsl(168_100%_17%/0.55)]'
                          : 'border-foreground/[0.1] bg-white text-primary',
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      {live && (
                        <>
                          <span className="absolute -inset-1.5 rounded-2xl border border-primary/25" />
                          <span className="absolute -inset-1.5 animate-ping rounded-2xl border border-primary/30" />
                        </>
                      )}
                    </motion.span>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, x: onRight ? 18 : -18 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '0px 0px -15% 0px' }}
                    transition={{ duration: 0.7, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                      'pl-[4.5rem] sm:pl-0',
                      onRight ? 'sm:col-start-2 sm:pl-10' : 'sm:col-start-1 sm:row-start-1 sm:pr-10',
                    )}
                  >
                    <Tilt max={3} innerClassName="rounded-2xl">
                      <div
                        className={cn(
                          'group relative overflow-hidden rounded-2xl border bg-white p-5 transition-all duration-300 hover:-translate-y-0.5',
                          live
                            ? 'border-primary/30 shadow-[0_20px_44px_-28px_hsl(168_30%_15%/0.35)]'
                            : 'border-foreground/[0.08] hover:border-primary/20 hover:shadow-[0_16px_36px_-24px_hsl(168_30%_15%/0.3)]',
                        )}
                      >
                        {live && (
                          <div
                            aria-hidden
                            className="shine-sweep pointer-events-none absolute inset-y-0 -left-1/4 w-1/4 -skew-x-12 bg-[linear-gradient(90deg,transparent,hsl(168_100%_17%/0.06),transparent)]"
                            style={{ animationDelay: '1.4s' }}
                          />
                        )}
                        <div className="relative flex flex-wrap items-center justify-between gap-3">
                          <p className="text-[15px] font-bold tracking-[-0.01em] text-foreground">{s.label}</p>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em]',
                              live ? 'bg-primary/10 text-primary' : 'bg-foreground/[0.06] text-foreground/45',
                            )}
                          >
                            {live ? (
                              <>
                                <CheckCircle2 className="h-3 w-3" /> Live
                              </>
                            ) : (
                              'In development'
                            )}
                          </span>
                        </div>
                        <p className="relative mt-2 text-[13px] leading-relaxed text-foreground/55">{s.note}</p>
                      </div>
                    </Tilt>
                  </motion.div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
