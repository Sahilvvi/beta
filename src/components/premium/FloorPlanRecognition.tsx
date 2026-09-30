import { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, FileImage, Upload, Boxes } from 'lucide-react';
import { Reveal, Stagger, staggerItem } from './Motion';
import { useInViewOrStacked } from '../motion/StackPanels';

/**
 * AI Floor Plan Recognition — 2D blueprint morphs into a furnished 3D render
 * across a draggable diagonal seam.
 */
export function FloorPlanRecognition() {
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInViewOrStacked(boxRef, { once: true, margin: '0px 0px -12% 0px' });
  const [split, setSplit] = useState(52);
  const dragging = useRef(false);

  const setFromEvent = useCallback((clientX: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setSplit(Math.min(88, Math.max(12, ((clientX - r.left) / r.width) * 100)));
  }, []);

  return (
    <section id="recognition" className="scroll-mt-24 py-16 lg:py-20">
      <div className="container mx-auto max-w-[1200px] px-6 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          {/* ---------- visual ---------- */}
          <Reveal y={36} blur={16}>
            <div
              ref={boxRef}
              onMouseMove={(e) => dragging.current && setFromEvent(e.clientX)}
              onMouseUp={() => { dragging.current = false; }}
              onMouseLeave={() => { dragging.current = false; }}
              onTouchMove={(e) => dragging.current && setFromEvent(e.touches[0].clientX)}
              onTouchEnd={() => { dragging.current = false; }}
              className="relative aspect-[4/3] select-none overflow-hidden rounded-[26px] border border-foreground/[0.10] bg-white shadow-[0_30px_80px_-24px_hsl(168_30%_15%/0.20)]"
            >
              {/* 3D render (base) */}
              <img
                src="/assets/samples/styled_room.png"
                alt="Generated 3D floor plan"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />

              {/* 2D blueprint (clipped to the left of the seam) */}
              <div
                className="absolute inset-0 bg-white"
                style={{ clipPath: `polygon(0 0, ${split + 9}% 0, ${split - 9}% 100%, 0 100%)` }}
              >
                <svg viewBox="0 0 400 300" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
                  <g opacity="0.18">
                    {Array.from({ length: 21 }).map((_, i) => (
                      <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="300" stroke="hsl(168 40% 45%)" strokeWidth="0.5" />
                    ))}
                    {Array.from({ length: 16 }).map((_, i) => (
                      <line key={`h${i}`} x1="0" y1={i * 20} x2="400" y2={i * 20} stroke="hsl(168 40% 45%)" strokeWidth="0.5" />
                    ))}
                  </g>

                  {/* outer + inner walls */}
                  {[
                    'M40,34 L360,34', 'M360,34 L360,266', 'M360,266 L40,266', 'M40,266 L40,34',
                    'M40,150 L230,150', 'M230,34 L230,266', 'M130,150 L130,266',
                  ].map((d, i) => (
                    <motion.path
                      key={i} d={d} fill="none"
                      stroke="hsl(160 84% 52%)" strokeWidth={i < 4 ? 4 : 2.6} strokeLinecap="square"
                      initial={{ pathLength: 0 }}
                      animate={inView ? { pathLength: 1 } : {}}
                      transition={{ duration: 0.9, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ))}

                  {/* fixtures — bed, bath, counters */}
                  <motion.g
                    initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.8, delay: 0.95 }}
                    stroke="hsl(160 70% 62%)" strokeWidth="1.6" fill="none"
                  >
                    <rect x="56" y="50" width="86" height="62" rx="3" />
                    <line x1="56" y1="66" x2="142" y2="66" />
                    <rect x="152" y="50" width="30" height="30" rx="3" />
                    <rect x="56" y="176" width="52" height="34" rx="3" />
                    <circle cx="84" cy="236" r="15" />
                    <rect x="250" y="46" width="94" height="22" rx="3" />
                    <rect x="250" y="200" width="94" height="52" rx="3" />
                  </motion.g>

                  {/* door swings */}
                  <motion.g
                    initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.7, delay: 1.15 }}
                    stroke="hsl(160 70% 62%)" strokeWidth="1.4" fill="none"
                  >
                    <path d="M172,150 a30,30 0 0 1 30,30" />
                    <path d="M230,196 a26,26 0 0 1 -26,26" />
                  </motion.g>

                  {/* dimension */}
                  <motion.g
                    initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.6, delay: 1.35 }}
                  >
                    <line x1="40" y1="282" x2="360" y2="282" stroke="hsl(160 70% 55% / 0.6)" strokeWidth="1" strokeDasharray="4 4" />
                    <text x="200" y="278" textAnchor="middle" fill="hsl(160 70% 65%)" fontSize="11" fontFamily="monospace">9.20 m</text>
                  </motion.g>
                </svg>

                <span className="absolute left-5 top-5 rounded-full border border-foreground/15 bg-black/42 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/70 backdrop-blur-md">
                  Your plan
                </span>
              </div>

              {/* the seam */}
              <div
                className="pointer-events-none absolute inset-y-0 w-[3px] bg-gradient-to-b from-[hsl(160_84%_55%)] via-[hsl(160_84%_45%)] to-[hsl(168_100%_25%)] shadow-[0_0_28px_hsl(160_84%_45%/0.85)]"
                style={{ left: `${split}%`, transform: 'skewX(-9deg)' }}
              />

              <button
                aria-label="Drag to compare plan and 3D"
                onMouseDown={(e) => { e.preventDefault(); dragging.current = true; }}
                onTouchStart={() => { dragging.current = true; }}
                className="absolute top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-[3px] border-white bg-primary shadow-[0_0_30px_hsl(160_84%_45%/0.6)] transition-transform hover:scale-110 active:scale-95"
                style={{ left: `${split}%` }}
              >
                <ArrowRight className="h-3.5 w-3.5 -translate-x-[3px] rotate-180 text-primary-foreground" />
                <ArrowRight className="h-3.5 w-3.5 -translate-x-[1px] text-primary-foreground" />
              </button>

              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 1.5, duration: 0.7 }}
                className="absolute bottom-5 right-5 rounded-full border border-primary/40 bg-primary/85 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground backdrop-blur-md"
              >
                3D result
              </motion.span>
            </div>
          </Reveal>

          {/* ---------- copy ---------- */}
          <div>
            <Reveal>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-primary">Coming soon</p>
              <h2 className="mt-5 text-[clamp(2rem,4.2vw,3.2rem)] font-bold leading-[1.06] tracking-[-0.025em] text-foreground">
                AI Floor Plan Recognition
              </h2>
              <p className="mt-6 max-w-[46ch] text-[16px] leading-relaxed text-foreground/58">
                Already have a plan on paper? Upload the image and Think Decor reads it —
                walls, rooms, doors and windows — then rebuilds it as a furnished 3D home
                you can walk through and edit.
              </p>
            </Reveal>

            <Stagger className="mt-9 space-y-3" gap={0.1}>
              {[
                { icon: Upload, t: 'Upload your plan', d: 'JPEG, JPG, PNG or PDF — a photo works.' },
                { icon: FileImage, t: 'AI reads the drawing', d: 'Walls, rooms, doors and windows detected automatically.' },
                { icon: Boxes, t: 'Open your 3D home', d: 'We email you the moment the design is ready.' },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div
                    key={s.t}
                    variants={staggerItem}
                    className="group flex items-start gap-4 rounded-2xl border border-foreground/[0.09] bg-foreground/[0.025] p-4 backdrop-blur-xl transition-all duration-500 hover:border-primary/30 hover:bg-primary/[0.04]"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-all duration-500 group-hover:scale-110 group-hover:bg-primary">
                      <Icon className="h-4 w-4 text-primary transition-colors duration-500 group-hover:text-primary-foreground" />
                    </span>
                    <span>
                      <span className="block text-[14.5px] font-medium text-foreground">
                        <span className="mr-2 font-mono text-[11px] text-primary/60">0{i + 1}</span>
                        {s.t}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-foreground/55">{s.d}</span>
                    </span>
                  </motion.div>
                );
              })}
            </Stagger>


          </div>
        </div>
      </div>
    </section>
  );
}
