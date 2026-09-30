import { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useScroll } from 'framer-motion';
import { useInViewOrStacked } from '../motion/StackPanels';

/* Room polygons in plan space (0-560 x 0-360) */
const rooms = [
  { id: 'living', label: 'Living', dims: '5.4 × 4.2 m', d: 'M20,20 L300,20 L300,200 L20,200 Z', cx: 160, cy: 112 },
  { id: 'kitchen', label: 'Kitchen', dims: '3.1 × 4.2 m', d: 'M300,20 L540,20 L540,200 L300,200 Z', cx: 420, cy: 112 },
  { id: 'bed', label: 'Bedroom', dims: '4.0 × 3.0 m', d: 'M20,200 L240,200 L240,340 L20,340 Z', cx: 130, cy: 270 },
  { id: 'bath', label: 'Bath', dims: '2.2 × 3.0 m', d: 'M240,200 L400,200 L400,340 L240,340 Z', cx: 320, cy: 270 },
  { id: 'study', label: 'Study', dims: '2.6 × 3.0 m', d: 'M400,200 L540,200 L540,340 L400,340 Z', cx: 470, cy: 270 },
];

/* Furniture that drops in after the walls settle */
const furniture = [
  { r: 'living', x: 46, y: 118, w: 130, h: 44, rx: 8 },
  { r: 'living', x: 200, y: 60, w: 74, h: 74, rx: 10 },
  { r: 'living', x: 92, y: 58, w: 54, h: 34, rx: 6 },
  { r: 'kitchen', x: 322, y: 40, w: 196, h: 26, rx: 5 },
  { r: 'kitchen', x: 386, y: 110, w: 78, h: 56, rx: 8 },
  { r: 'bed', x: 46, y: 232, w: 96, h: 74, rx: 8 },
  { r: 'bed', x: 162, y: 240, w: 44, h: 34, rx: 5 },
  { r: 'bath', x: 262, y: 228, w: 44, h: 60, rx: 8 },
  { r: 'bath', x: 330, y: 292, w: 48, h: 30, rx: 6 },
  { r: 'study', x: 420, y: 232, w: 96, h: 34, rx: 5 },
  { r: 'study', x: 452, y: 288, w: 36, h: 36, rx: 8 },
];

const walls = [
  'M20,20 L540,20', 'M540,20 L540,340', 'M540,340 L20,340', 'M20,340 L20,20',
  'M300,20 L300,200', 'M20,200 L540,200', 'M240,200 L240,340', 'M400,200 L400,340',
];

/**
 * Cinematic isometric floor plan that assembles itself, then responds to
 * the cursor with true 3D rotation. Scroll morphs plan → styled interior.
 */
export function FloorPlanStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const inView = useInViewOrStacked(hostRef, { once: true, margin: '0px 0px -5% 0px' });
  const [hovered, setHovered] = useState<string | null>(null);

  /* cursor-driven rotation with spring physics */
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 140, damping: 20, mass: 0.6 });
  const sry = useSpring(ry, { stiffness: 140, damping: 20, mass: 0.6 });

  /* scroll: plan flattens toward the realistic render */
  const { scrollYProgress } = useScroll({ target: hostRef, offset: ['start 80%', 'end 10%'] });
  const renderOpacity = useSpring(useTransform(scrollYProgress, [0.15, 0.62], [0, 1]), { stiffness: 80, damping: 28 });
  const planOpacity = useSpring(useTransform(scrollYProgress, [0.15, 0.55], [1, 0.12]), { stiffness: 80, damping: 28 });
  const tiltDown = useTransform(scrollYProgress, [0, 0.6], [0, -8]);

  const [assembled, setAssembled] = useState(false);
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setAssembled(true), 2600);
    return () => clearTimeout(t);
  }, [inView]);

  return (
    <div
      ref={hostRef}
      className="relative w-full [perspective:1600px]"
      onMouseMove={(e) => {
        const r = hostRef.current?.getBoundingClientRect();
        if (!r) return;
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 26);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 16);
      }}
      onMouseLeave={() => { rx.set(0); ry.set(0); }}
    >
      <motion.div
        style={{ rotateX: srx, rotateY: sry, transformStyle: 'preserve-3d' }}
        className="relative w-full"
      >
        {/* ambient floor glow */}
        <div className="absolute inset-x-[8%] -bottom-6 h-24 rounded-[100%] bg-primary/20 blur-[60px]" />

        <motion.div style={{ rotateX: tiltDown }} className="relative rounded-[26px] overflow-hidden border border-foreground/[0.10] bg-white/80 backdrop-blur-2xl shadow-[0_30px_80px_-24px_hsl(168_30%_15%/0.20)]">
          {/* window chrome */}
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-foreground/[0.08]">
            <span className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
            <span className="ml-3 text-[11px] tracking-wide text-foreground/50 font-medium">apartment-plan · thinkdecor</span>
            <motion.span
              className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary"
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {assembled ? 'Plan ready' : 'Generating'}
            </motion.span>
          </div>

          <div className="relative aspect-[16/10]">
            {/* realistic render revealed on scroll */}
            <motion.img
              src="/assets/samples/styled_room.png"
              alt="Rendered interior"
              style={{ opacity: renderOpacity }}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <motion.div style={{ opacity: renderOpacity }} className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

            {/* the plan */}
            <motion.svg
              viewBox="0 0 560 360"
              style={{ opacity: planOpacity }}
              className="absolute inset-0 w-full h-full"
            >
              <defs>
                <linearGradient id="fp-room" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(168 100% 17% / 0.30)" />
                  <stop offset="100%" stopColor="hsl(168 100% 17% / 0.06)" />
                </linearGradient>
                <linearGradient id="fp-hot" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(160 84% 39% / 0.55)" />
                  <stop offset="100%" stopColor="hsl(168 100% 22% / 0.22)" />
                </linearGradient>
                <linearGradient id="fp-scan" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="transparent" />
                  <stop offset="50%" stopColor="hsl(160 84% 45% / 0.5)" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>

              {/* graph paper */}
              <g opacity="0.22">
                {Array.from({ length: 29 }).map((_, i) => (
                  <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="360" stroke="hsl(168 30% 40% / 0.25)" strokeWidth="0.5" />
                ))}
                {Array.from({ length: 19 }).map((_, i) => (
                  <line key={`h${i}`} x1="0" y1={i * 20} x2="560" y2={i * 20} stroke="hsl(168 30% 40% / 0.25)" strokeWidth="0.5" />
                ))}
              </g>

              {/* room fills */}
              {rooms.map((r, i) => (
                <motion.path
                  key={r.id}
                  d={r.d}
                  fill={hovered === r.id ? 'url(#fp-hot)' : 'url(#fp-room)'}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ duration: 0.9, delay: 1.15 + i * 0.11, ease: [0.22, 1, 0.36, 1] }}
                  onMouseEnter={() => setHovered(r.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'pointer', transition: 'fill 0.4s ease' }}
                />
              ))}

              {/* walls draw themselves */}
              {walls.map((d, i) => (
                <motion.path
                  key={i}
                  d={d}
                  stroke="hsl(160 84% 45%)"
                  strokeWidth={i < 4 ? 3.5 : 2.2}
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={inView ? { pathLength: 1, opacity: 0.95 } : {}}
                  transition={{ duration: 1.05, delay: i * 0.11, ease: [0.22, 1, 0.36, 1] }}
                />
              ))}

              {/* AI scan sweep */}
              {inView && (
                <motion.rect
                  x="0" y="0" width="90" height="360"
                  fill="url(#fp-scan)"
                  initial={{ x: -110 }}
                  animate={{ x: [-110, 570] }}
                  transition={{ duration: 2.1, delay: 0.9, repeat: assembled ? 0 : Infinity, ease: 'easeInOut' }}
                />
              )}

              {/* furniture drops in */}
              {furniture.map((f, i) => (
                <motion.rect
                  key={i}
                  x={f.x} y={f.y} width={f.w} height={f.h} rx={f.rx}
                  fill={hovered === f.r ? 'hsl(160 84% 55% / 0.5)' : 'hsl(160 60% 60% / 0.24)'}
                  stroke={hovered === f.r ? 'hsl(160 84% 60% / 0.9)' : 'hsl(160 70% 55% / 0.4)'}
                  strokeWidth="1"
                  initial={{ opacity: 0, y: f.y - 18 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ type: 'spring', stiffness: 180, damping: 18, delay: 2.0 + i * 0.05 }}
                  style={{ transition: 'fill 0.35s ease, stroke 0.35s ease' }}
                />
              ))}

              {/* dimension lines */}
              <motion.g
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ duration: 0.8, delay: 2.5 }}
              >
                <motion.line
                  x1="20" y1="352" x2="540" y2="352"
                  stroke="hsl(160 70% 55% / 0.5)" strokeWidth="1" strokeDasharray="4 4"
                  initial={{ pathLength: 0 }} animate={inView ? { pathLength: 1 } : {}}
                  transition={{ duration: 1.1, delay: 2.5 }}
                />
                <text x="280" y="349" textAnchor="middle" fill="hsl(160 70% 62%)" fontSize="11" fontFamily="monospace">8.6 m</text>
                <motion.line
                  x1="552" y1="20" x2="552" y2="340"
                  stroke="hsl(160 70% 55% / 0.5)" strokeWidth="1" strokeDasharray="4 4"
                  initial={{ pathLength: 0 }} animate={inView ? { pathLength: 1 } : {}}
                  transition={{ duration: 1.1, delay: 2.65 }}
                />
              </motion.g>

              {/* room labels */}
              {rooms.map((r, i) => (
                <motion.g
                  key={`l-${r.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.7, delay: 2.15 + i * 0.09 }}
                  style={{ pointerEvents: 'none' }}
                >
                  <text x={r.cx} y={r.cy - 4} textAnchor="middle" fill="white" fontSize="13" fontWeight="600" opacity={hovered === r.id ? 1 : 0.85}>
                    {r.label}
                  </text>
                  <text x={r.cx} y={r.cy + 12} textAnchor="middle" fill="hsl(160 70% 62%)" fontSize="10" fontFamily="monospace" opacity={hovered === r.id ? 1 : 0.6}>
                    {r.dims}
                  </text>
                </motion.g>
              ))}
            </motion.svg>

            {/* floating stat card */}
            <motion.div
              initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
              animate={inView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
              transition={{ duration: 0.9, delay: 2.9 }}
              className="absolute bottom-5 left-5 rounded-2xl border border-white/10 bg-black/42 backdrop-blur-xl px-4 py-3"
              style={{ transform: 'translateZ(50px)' }}
            >
              <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/55">Detected</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">5 rooms · 8 walls · 11 items</p>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
