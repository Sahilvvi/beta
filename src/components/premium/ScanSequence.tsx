import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Scan, Ruler, Sparkles } from 'lucide-react';
import { useInViewOrStacked } from '../motion/StackPanels';

const STAGES = [
  { id: 0, label: 'Scanning room', icon: Smartphone },
  { id: 1, label: 'Building point cloud', icon: Scan },
  { id: 2, label: 'Generating floor plan', icon: Ruler },
  { id: 3, label: 'Mantha AI redesign', icon: Sparkles },
];

const WALLS = [
  'M30,26 L330,26', 'M330,26 L330,214', 'M330,214 L30,214', 'M30,214 L30,26',
  'M190,26 L190,120', 'M30,120 L330,120',
];

const POINTS = Array.from({ length: 76 }, (_, i) => ({
  x: 32 + ((i * 61) % 292),
  y: 30 + ((i * 97) % 178),
  d: (i % 14) * 0.045,
}));

/** Hero: phone scan → point cloud → floor plan → measurements → AI redesign. */
export function ScanSequence() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewOrStacked(ref, { margin: '0px 0px -10% 0px' });
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const id = setInterval(() => setStage((s) => (s + 1) % 4), 3400);
    return () => clearInterval(id);
  }, [inView]);

  return (
    <div ref={ref} className="relative w-full">
      {/* stage rail */}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const active = stage === i;
          const done = i < stage;
          return (
            <button
              key={s.id}
              onClick={() => setStage(i)}
              className={`group flex items-center gap-2.5 rounded-full border px-4 py-2 text-[13px] font-medium transition-all duration-500 ${
                active
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : done
                    ? 'border-foreground/[0.10] bg-foreground/[0.025] text-foreground/55'
                    : 'border-foreground/[0.08] bg-transparent text-foreground/42'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-500 ${active ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.05] text-foreground/55'}`}>
                <Icon className="h-3 w-3" />
              </span>
              {s.label}
              {active && (
                <motion.span
                  layoutId="scan-underline"
                  className="ml-1 h-1 w-1 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* stage window */}
      <div className="relative overflow-hidden rounded-[24px] border border-foreground/[0.10] bg-white/85 backdrop-blur-2xl shadow-[0_30px_80px_-24px_hsl(168_30%_15%/0.20)]">
        <div className="flex items-center gap-2.5 border-b border-foreground/[0.08] px-5 py-3.5">
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/12" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/12" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/12" />
          <span className="ml-3 text-[11px] font-medium tracking-wide text-foreground/45">living-room-scan · thinkdecor</span>
          <motion.span
            key={stage}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {STAGES[stage].label}
          </motion.span>
        </div>

        <div className="relative aspect-[16/10]">
          {/* base room photo */}
          <img
            src="/assets/samples/empty_room.png"
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ${
              stage === 3 ? 'opacity-0 scale-105' : stage === 0 ? 'opacity-95' : 'opacity-30 saturate-50'
            }`}
          />
          {/* redesigned room */}
          <img
            src="/assets/samples/styled_room.png"
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ${stage === 3 ? 'opacity-100' : 'opacity-0'}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

          {/* stage 0 — phone scanning */}
          <AnimatePresence>
            {stage === 0 && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                <motion.div
                  animate={{ x: ['-38%', '38%', '-38%'], rotate: [-4, 4, -4] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute left-1/2 top-1/2 h-[42%] w-[21%] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border-2 border-white/60 bg-black/25 backdrop-blur-[2px]"
                >
                  <div className="absolute inset-x-3 top-2 h-1 rounded-full bg-white/35" />
                  <motion.div
                    animate={{ opacity: [0.25, 0.7, 0.25] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                    className="absolute inset-2 rounded-lg border border-primary/60"
                  />
                </motion.div>
                {/* scan cone */}
                <motion.div
                  animate={{ opacity: [0.15, 0.4, 0.15] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0"
                  style={{ background: 'conic-gradient(from 200deg at 50% 50%, transparent 0deg, hsl(160 84% 45% / 0.18) 40deg, transparent 80deg)' }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* stage 1 — point cloud */}
          <AnimatePresence>
            {stage === 1 && (
              <motion.svg
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                viewBox="0 0 360 240" className="absolute inset-0 h-full w-full"
              >
                {POINTS.map((p, i) => (
                  <motion.circle
                    key={i} cx={p.x} cy={p.y} r="1.5" fill="hsl(160 84% 55%)"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: [0, 0.9, 0.55], scale: 1 }}
                    transition={{ duration: 0.5, delay: p.d }}
                  />
                ))}
                <motion.rect
                  x="0" y="0" width="60" height="240"
                  fill="url(#sweep)"
                  animate={{ x: [-70, 370] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                />
                <defs>
                  <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="50%" stopColor="hsl(160 84% 45% / 0.35)" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </defs>
              </motion.svg>
            )}
          </AnimatePresence>

          {/* stage 2 — floor plan + measurements */}
          <AnimatePresence>
            {stage === 2 && (
              <motion.svg
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                viewBox="0 0 360 240" className="absolute inset-0 h-full w-full"
              >
                <motion.rect
                  x="30" y="26" width="300" height="188"
                  fill="hsl(168 100% 17% / 0.16)"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                />
                {WALLS.map((d, i) => (
                  <motion.path
                    key={i} d={d} stroke="hsl(160 84% 50%)" strokeWidth={i < 4 ? 2.6 : 1.6}
                    strokeLinecap="round" fill="none"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  />
                ))}
                {/* door + window markers */}
                <motion.path d="M108,26 a20,20 0 0 1 20,20" stroke="hsl(160 84% 60%)" strokeWidth="1.4" fill="none"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.95 }} />
                <motion.line x1="250" y1="26" x2="300" y2="26" stroke="hsl(190 90% 62%)" strokeWidth="3.4"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.05 }} />
                {/* dimensions */}
                {[
                  { x1: 30, y1: 226, x2: 330, y2: 226, tx: 180, ty: 223, t: '6.40 m' },
                  { x1: 344, y1: 26, x2: 344, y2: 214, tx: 344, ty: 122, t: '4.05 m', v: true },
                ].map((d, i) => (
                  <motion.g key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 + i * 0.15 }}>
                    <motion.line
                      x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2}
                      stroke="hsl(160 70% 55% / 0.6)" strokeWidth="1" strokeDasharray="3 3"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 1.1 + i * 0.15 }}
                    />
                    <text
                      x={d.tx} y={d.ty} textAnchor="middle" fill="hsl(160 70% 65%)" fontSize="9" fontFamily="monospace"
                      transform={d.v ? `rotate(-90 ${d.tx} ${d.ty})` : undefined}
                    >{d.t}</text>
                  </motion.g>
                ))}
                <motion.text x="110" y="80" textAnchor="middle" fill="white" fontSize="11" fontWeight="600"
                  initial={{ opacity: 0, y: 86 }} animate={{ opacity: 0.9, y: 80 }} transition={{ delay: 1.25 }}>Living</motion.text>
                <motion.text x="110" y="93" textAnchor="middle" fill="hsl(160 70% 62%)" fontSize="8" fontFamily="monospace"
                  initial={{ opacity: 0 }} animate={{ opacity: 0.75 }} transition={{ delay: 1.35 }}>18.4 m²</motion.text>
              </motion.svg>
            )}
          </AnimatePresence>

          {/* stage 3 — AI badges */}
          <AnimatePresence>
            {stage === 3 && (
              <>
                {[
                  { t: 'Scandinavian · warm oak', x: '8%', y: '18%' },
                  { t: '₹1.84L estimated', x: '58%', y: '34%' },
                  { t: '12 products matched', x: '14%', y: '62%' },
                ].map((b, i) => (
                  <motion.span
                    key={b.t}
                    initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: 0.25 + i * 0.16, duration: 0.6 }}
                    className="absolute flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/85 px-3 py-1.5 text-[11px] font-semibold text-primary-foreground backdrop-blur-md"
                    style={{ left: b.x, top: b.y }}
                  >
                    <Sparkles className="h-3 w-3" />
                    {b.t}
                  </motion.span>
                ))}
              </>
            )}
          </AnimatePresence>

          {/* progress bar */}
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-foreground/[0.05]">
            <motion.div
              key={stage}
              className="h-full bg-gradient-to-r from-primary to-[hsl(160_84%_45%)]"
              initial={{ width: '0%' }} animate={{ width: '100%' }}
              transition={{ duration: 3.4, ease: 'linear' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
