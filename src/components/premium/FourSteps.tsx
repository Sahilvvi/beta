import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useInViewOrStacked } from '../motion/StackPanels';
import {
  ArrowRight, Clock, UserPlus, Download, ScanLine, FileDown, Check, Sparkles,
} from 'lucide-react';
import { Reveal, Magnetic } from './Motion';

const STEPS = [
  { n: 1, icon: UserPlus,  time: '3 min',  lead: 'Sign up',            rest: 'Create your account — photo redesigns work today.' },
  { n: 2, icon: Download,  time: '30 sec', lead: 'Get the app',        rest: 'Log in and download Think Decor to your phone.' },
  { n: 3, icon: ScanLine,  time: '5 min',  lead: 'Scan the property',  rest: 'Walk through the space once, then upload.' },
  { n: 4, icon: FileDown,  time: '10 sec', lead: 'Download',           rest: 'Your measured plans and 3D design, ready to use.' },
];

const DURATION = 4600;

/* ------------------------------------------------------------------ */
/* Stage visuals — designed for the cream canvas                       */
/* ------------------------------------------------------------------ */
function Stage({ n }: { n: number }) {
  if (n === 1) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[300px] rounded-2xl border border-foreground/[0.08] bg-white p-6 shadow-[0_18px_44px_-16px_hsl(168_30%_15%/0.16)]"
        >
          <p className="text-[13px] font-medium text-foreground">Create your account</p>
          <div className="mt-4 space-y-2.5">
            {['name@company.com', '••••••••'].map((f, i) => (
              <motion.div
                key={f}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.14 }}
                className="rounded-lg border border-foreground/[0.09] bg-foreground/[0.02] px-3 py-2.5 text-[12px] text-foreground/45"
              >
                {f}
              </motion.div>
            ))}
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, type: 'spring', stiffness: 260, damping: 18 }}
            className="mt-3 rounded-lg bg-primary py-2.5 text-center text-[12.5px] font-semibold text-primary-foreground"
          >
            Start free
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85 }}
            className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-foreground/40"
          >
            <Sparkles className="h-3 w-3 text-primary" /> 2 free redesigns today
          </motion.p>
        </motion.div>
      </div>
    );
  }

  if (n === 2) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <motion.div
          animate={{ y: [0, -9, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="relative h-[228px] w-[128px] rounded-[22px] border border-foreground/[0.10] bg-white shadow-[0_22px_50px_-18px_hsl(168_30%_15%/0.22)]"
        >
          <div className="absolute inset-x-9 top-2.5 h-1 rounded-full bg-foreground/10" />
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 15 }}
              className="flex h-[58px] w-[58px] items-center justify-center rounded-[16px] bg-primary shadow-[0_10px_24px_-8px_hsl(168_100%_17%/0.6)]"
            >
              <Download className="h-6 w-6 text-primary-foreground" />
            </motion.span>
            <span className="text-[11.5px] font-medium text-foreground/70">Think Decor</span>
          </div>
          <div className="absolute inset-x-7 bottom-7 h-[3px] overflow-hidden rounded-full bg-foreground/[0.07]">
            <motion.div
              initial={{ width: '0%' }} animate={{ width: '100%' }}
              transition={{ duration: 2, delay: 0.35 }}
              className="h-full rounded-full bg-primary"
            />
          </div>
        </motion.div>
      </div>
    );
  }

  if (n === 3) {
    return (
      <div className="relative h-full overflow-hidden">
        <img src="/assets/samples/empty_room.png" alt="Room photo ready for AI redesign" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{ x: [-46, 46, -46], rotate: [-5, 5, -5] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
            className="relative h-[186px] w-[104px] rounded-[16px] border-2 border-white/95 bg-white/10 backdrop-blur-[2px] shadow-2xl"
          >
            <motion.div
              animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.7, repeat: Infinity }}
              className="absolute inset-2 rounded-[10px] border-2 border-primary"
            />
          </motion.div>
        </div>
        <motion.div
          animate={{ y: ['-100%', '110%'] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-x-0 h-20"
          style={{ background: 'linear-gradient(180deg, transparent, hsl(168 100% 30% / 0.45), transparent)' }}
        />
        <span className="absolute bottom-4 left-4 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-md">
          Capturing geometry…
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-10">
      <svg viewBox="0 0 220 150" className="w-full max-w-[300px]">
        {['M26,20 h168', 'M194,20 v110', 'M194,130 h-168', 'M26,130 v-110', 'M112,20 v64', 'M26,84 h168'].map((d, i) => (
          <motion.path
            key={i} d={d} fill="none" stroke="hsl(168 100% 17%)" strokeWidth={i < 4 ? 2.8 : 1.8} strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85 }} fill="hsl(0 0% 4%)">
          <text x="69" y="56" textAnchor="middle" fontSize="9" fontWeight="600">Living</text>
          <text x="153" y="56" textAnchor="middle" fontSize="9" fontWeight="600">Kitchen</text>
          <text x="110" y="112" textAnchor="middle" fontSize="9" fontWeight="600">Bedroom</text>
        </motion.g>
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
          <line x1="26" y1="142" x2="194" y2="142" stroke="hsl(168 100% 17% / 0.4)" strokeWidth="1" strokeDasharray="3 3" />
          <text x="110" y="139" textAnchor="middle" fill="hsl(168 100% 20%)" fontSize="8" fontFamily="monospace">7.40 m</text>
        </motion.g>
      </svg>
      <div className="flex gap-2">
        {['PDF', 'SVG', 'DWG'].map((t, i) => (
          <motion.span
            key={t}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1 + i * 0.1, type: 'spring', stiffness: 240, damping: 18 }}
            className="rounded-lg border border-primary/25 bg-primary/[0.07] px-3.5 py-1.5 font-mono text-[11px] font-medium text-primary"
          >
            {t}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function FourSteps() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewOrStacked(ref, { margin: '0px 0px -15% 0px' });
  const [active, setActive] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (!inView) return;
    const id = setInterval(() => {
      if (!paused.current) setActive((p) => (p + 1) % STEPS.length);
    }, DURATION);
    return () => clearInterval(id);
  }, [inView]);

  return (
    <section id="get-started" className="scroll-mt-24 border-y border-foreground/[0.07] py-20 lg:py-24">
      <div className="container mx-auto max-w-[1200px] px-6 sm:px-8">
        <Reveal className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-primary">Coming soon · Scanning app</p>
          <h2 className="mx-auto mt-5 max-w-[20ch] text-[clamp(1.9rem,4vw,3.2rem)] font-bold leading-[1.08] tracking-[-0.02em] text-foreground">
            Floor plans in four steps.
          </h2>
          <p className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-2 text-[15.5px] leading-relaxed text-foreground/55">
            How room scanning will work when the Think Decor app launches
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1 text-[12.5px] font-medium text-primary">
              <Clock className="h-3 w-3" /> In development
            </span>
          </p>
        </Reveal>

        <div
          ref={ref}
          onMouseEnter={() => { paused.current = true; }}
          onMouseLeave={() => { paused.current = false; }}
          className="mt-14 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12"
        >
          {/* ---------- vertical stepper ---------- */}
          <div className="relative">
            {/* rail */}
            <div className="absolute bottom-6 left-[42px] top-6 w-[2px] rounded-full bg-foreground/[0.07]" />
            <motion.div
              className="absolute left-[42px] top-6 w-[2px] rounded-full bg-gradient-to-b from-primary to-[hsl(168_80%_30%)]"
              animate={{ height: `${(active / (STEPS.length - 1)) * 100}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              style={{ maxHeight: 'calc(100% - 48px)' }}
            />

            <div className="space-y-2">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const on = active === i;
                const done = i < active;
                return (
                  <button
                    key={s.n}
                    onClick={() => setActive(i)}
                    className={`group relative flex w-full items-start gap-5 rounded-2xl p-4 text-left transition-all duration-500 ${
                      on ? 'bg-white shadow-[0_14px_38px_-16px_hsl(168_30%_15%/0.18)]' : 'hover:bg-foreground/[0.02]'
                    }`}
                  >
                    <span
                      className={`relative z-10 flex h-[54px] w-[54px] flex-shrink-0 items-center justify-center rounded-2xl border transition-all duration-500 ${
                        on
                          ? 'scale-105 border-primary bg-primary text-primary-foreground shadow-[0_10px_26px_-8px_hsl(168_100%_17%/0.55)]'
                          : done
                            ? 'border-primary/30 bg-primary/[0.08] text-primary'
                            : 'border-foreground/[0.10] bg-white text-foreground/35'
                      }`}
                    >
                      {on && (
                        <motion.span
                          className="absolute inset-0 rounded-2xl border-2 border-primary"
                          animate={{ opacity: [0.55, 0], scale: [1, 1.3] }}
                          transition={{ duration: 1.9, repeat: Infinity }}
                        />
                      )}
                      {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </span>

                    <span className="min-w-0 flex-1 pt-1">
                      <span className="flex items-center gap-2.5">
                        <span className={`font-mono text-[10.5px] uppercase tracking-[0.18em] transition-colors ${on ? 'text-primary' : 'text-foreground/30'}`}>
                          Step {s.n}
                        </span>
                        <span className={`flex items-center gap-1 text-[11.5px] transition-colors ${on ? 'text-foreground/55' : 'text-foreground/35'}`}>
                          <Clock className="h-3 w-3" />{s.time}
                        </span>
                      </span>
                      <span className={`mt-1.5 block text-[16px] font-semibold transition-colors ${on ? 'text-foreground' : 'text-foreground/60'}`}>
                        {s.lead}
                      </span>
                      <span
                        className={`block overflow-hidden text-[13.5px] leading-relaxed text-foreground/50 transition-all duration-500 ${
                          on ? 'mt-1 max-h-16 opacity-100' : 'max-h-0 opacity-0'
                        }`}
                      >
                        {s.rest}
                      </span>
                      {on && (
                        <span className="mt-3 block h-[2px] w-full overflow-hidden rounded-full bg-foreground/[0.07]">
                          <motion.span
                            key={`p-${active}`}
                            className="block h-full bg-primary"
                            initial={{ width: '0%' }} animate={{ width: '100%' }}
                            transition={{ duration: DURATION / 1000, ease: 'linear' }}
                          />
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------- stage ---------- */}
          <div className="relative">
            <div className="pointer-events-none absolute -inset-6 rounded-[40px] bg-[radial-gradient(ellipse_at_center,hsl(168_100%_17%/0.10),transparent_70%)] blur-2xl" />
            <div className="relative overflow-hidden rounded-[26px] border border-foreground/[0.08] bg-white shadow-[0_26px_70px_-24px_hsl(168_30%_15%/0.22)]">
              <div className="flex items-center gap-2 border-b border-foreground/[0.07] px-5 py-3.5">
                <span className="h-2.5 w-2.5 rounded-full bg-foreground/[0.10]" />
                <span className="h-2.5 w-2.5 rounded-full bg-foreground/[0.10]" />
                <span className="h-2.5 w-2.5 rounded-full bg-foreground/[0.10]" />
                <span className="ml-2 text-[11px] font-medium text-foreground/35">
                  thinkdecor · step {STEPS[active].n} of 4
                </span>
                <motion.span
                  key={`live-${active}`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  {STEPS[active].lead}
                </motion.span>
              </div>

              <div className="relative h-[344px] bg-[hsl(168_24%_98%)]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, scale: 0.98, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 1.01, filter: 'blur(6px)' }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0"
                  >
                    <Stage n={STEPS[active].n} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        <Reveal delay={0.2} className="mt-14 text-center">
          <Magnetic>
            <Link
              to="/signup"
              className="group inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-4 text-[15px] font-semibold text-primary-foreground shadow-[0_14px_34px_-10px_hsl(168_100%_17%/0.45)] transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98]"
            >
              Try photo redesigns free
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Magnetic>
        </Reveal>
      </div>
    </section>
  );
}
