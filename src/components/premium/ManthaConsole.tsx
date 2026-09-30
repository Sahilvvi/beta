import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Check, Wallet, Palette, Sofa } from 'lucide-react';
import { useInViewOrStacked } from '../motion/StackPanels';

const PROMPT = 'Design my bedroom in Scandinavian style under £2,000.';

const THOUGHTS = [
  'Reading room geometry · 3.6 × 4.2 m',
  'Matching Scandinavian palette',
  'Selecting furniture within budget',
  'Checking clearance and circulation',
];

const PALETTE = ['#EFE7DC', '#D9C7B0', '#8FA69A', '#3F4A45', '#1C2220'];

const ITEMS = [
  { n: 'Oak platform bed', p: '820' },
  { n: 'Linen bedding set', p: '110' },
  { n: 'Wool rug 6×8', p: '295' },
  { n: 'Ash bedside pair', p: '248' },
  { n: 'Arc floor lamp', p: '370' },
];

type Phase = 'idle' | 'typing' | 'thinking' | 'done';

export function ManthaConsole() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewOrStacked(ref, { once: true, margin: '0px 0px -20% 0px' });
  const started = useRef(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [typed, setTyped] = useState('');
  const [thought, setThought] = useState(0);

  /* one linear sequence — no effect can cancel another mid-flight */
  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    setPhase('typing');
    let i = 0;
    const typer = setInterval(() => {
      i += 1;
      setTyped(PROMPT.slice(0, i));
      if (i >= PROMPT.length) {
        clearInterval(typer);
        timers.push(setTimeout(() => {
          setPhase('thinking');
          THOUGHTS.forEach((_, k) => {
            timers.push(setTimeout(() => setThought(k), k * 820));
          });
          timers.push(setTimeout(() => setPhase('done'), THOUGHTS.length * 820 + 500));
        }, 450));
      }
    }, 32);

    return () => { clearInterval(typer); timers.forEach(clearTimeout); };
  }, [inView]);

  const done = phase === 'done';

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
      {/* ---------------- conversation ---------------- */}
      <div className="relative flex flex-col overflow-hidden rounded-[22px] border border-foreground/[0.10] bg-white/80 backdrop-blur-2xl">
        <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />

        <div className="relative flex items-center gap-3 border-b border-foreground/[0.08] px-5 py-4">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[hsl(160_84%_38%)]">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
            <motion.span
              animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full border border-primary"
            />
          </span>
          <div>
            <p className="text-[14px] font-medium text-foreground">Mantha AI</p>
            <p className="flex items-center gap-1.5 text-[11px] text-foreground/50">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(160_84%_45%)]" />
              {done ? 'Concept ready' : phase === 'thinking' ? 'Thinking…' : 'Online'}
            </p>
          </div>
        </div>

        <div className="relative flex-1 space-y-4 p-5">
          <div className="flex justify-end">
            <div className="max-w-[86%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[13.5px] leading-relaxed text-primary-foreground shadow-[0_12px_30px_-12px_hsl(168_100%_17%)]">
              {typed || ' '}
              {phase === 'typing' && (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  className="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[2px] bg-primary-foreground"
                />
              )}
            </div>
          </div>

          <AnimatePresence>
            {phase === 'thinking' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="space-y-2 rounded-2xl rounded-bl-md border border-foreground/[0.09] bg-foreground/[0.03] px-4 py-3.5"
              >
                {THOUGHTS.map((t, i) => (
                  <motion.div
                    key={t}
                    initial={{ opacity: 0, x: -8 }}
                    animate={i <= thought ? { opacity: 1, x: 0 } : { opacity: 0.2, x: -8 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center gap-2.5 text-[12.5px]"
                  >
                    {i < thought ? (
                      <Check className="h-3.5 w-3.5 flex-shrink-0 text-[hsl(160_84%_45%)]" />
                    ) : (
                      <motion.span
                        animate={i === thought ? { rotate: 360 } : {}}
                        transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                        className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-primary border-t-transparent"
                      />
                    )}
                    <span className={i <= thought ? 'text-foreground/70' : 'text-foreground/38'}>{t}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {done && (
              <motion.div
                initial={{ opacity: 0, y: 12, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.6 }}
                className="space-y-3"
              >
                <div className="rounded-2xl rounded-bl-md border border-foreground/[0.09] bg-foreground/[0.03] px-4 py-3.5 text-[13.5px] leading-relaxed text-foreground/80">
                  Here's a Scandinavian bedroom for your 3.6 × 4.2 m room — warm oak, soft
                  linen and a muted sage accent. It lands at{' '}
                  <span className="font-semibold text-primary">£1,843</span>, just under budget.
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { i: Sofa, t: '3 variations' },
                    { i: Palette, t: 'Palette' },
                    { i: Wallet, t: 'Budget report' },
                  ].map((c, k) => (
                    <motion.span
                      key={c.t}
                      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 + k * 0.08 }}
                      className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[11.5px] font-medium text-primary"
                    >
                      <c.i className="h-3 w-3" />
                      {c.t}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative px-5 pb-5">
          <div className="flex items-center gap-3 rounded-xl border border-foreground/[0.09] bg-black/35 px-4 py-3">
            <span className="flex-1 text-[13px] text-foreground/38">Ask Mantha about your space…</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Send className="h-3.5 w-3.5 text-primary-foreground" />
            </span>
          </div>
        </div>
      </div>

      {/* ---------------- generated output ---------------- */}
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-[22px] border border-foreground/[0.10]">
          <motion.img
            src="/assets/samples/3.jpg"
            alt="Generated bedroom concept"
            initial={{ scale: 1.08, filter: 'blur(18px)' }}
            animate={done ? { scale: 1, filter: 'blur(0px)' } : { scale: 1.08, filter: 'blur(18px)' }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="h-[262px] w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />

          <AnimatePresence>
            {!done && (
              <motion.div exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-white/70">
                <div className="w-48 space-y-2.5 text-center">
                  <div className="h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary to-[hsl(160_84%_45%)]"
                      initial={{ width: '0%' }}
                      animate={{ width: phase === 'thinking' ? '92%' : phase === 'typing' ? '35%' : '8%' }}
                      transition={{ duration: 2.6, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/45">Generating concept</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="absolute inset-x-5 bottom-5 flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/55">Concept 01</p>
              <p className="text-[15px] font-medium text-foreground">Warm Scandinavian</p>
            </div>
            <div className="flex gap-1.5">
              {PALETTE.map((c, i) => (
                <motion.span
                  key={c}
                  initial={{ opacity: 0, y: 10 }}
                  animate={done ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.3 + i * 0.07 }}
                  className="h-6 w-6 rounded-md border border-foreground/20 shadow-lg"
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-foreground/[0.10] bg-foreground/[0.025] p-5 backdrop-blur-xl">
          <div className="mb-3.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/50">Shopping list</p>
            <p className="text-[11px] text-foreground/42">5 items</p>
          </div>

          <div className="space-y-0.5">
            {ITEMS.map((it, i) => (
              <motion.div
                key={it.n}
                initial={{ opacity: 0, x: -12 }}
                animate={done ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.35 + i * 0.08, duration: 0.45 }}
                className="group flex items-center justify-between rounded-lg px-2 py-2.5 transition-colors hover:bg-foreground/[0.03]"
              >
                <span className="flex items-center gap-2.5 text-[13px] text-foreground/70 group-hover:text-foreground/90">
                  <span className="h-1 w-1 rounded-full bg-primary/50" />
                  {it.n}
                </span>
                <span className="font-mono text-[12.5px] text-foreground/80">£{it.p}</span>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={done ? { opacity: 1 } : {}}
            transition={{ delay: 0.85 }}
            className="mt-4 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/[0.08] px-4 py-3"
          >
            <span className="text-[12px] text-foreground/60">Total · under £2,000</span>
            <span className="text-[16px] font-semibold text-primary">£1,843</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
