import { ReactNode, useRef, useState, useEffect } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform, useScroll } from 'framer-motion';
import { useInViewOrStacked } from '@/components/motion/StackPanels';

/* ------------------------------------------------------------------ */
/* Reveal — blur + mask + rise. The house entrance animation.          */
/* ------------------------------------------------------------------ */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  blur = 12,
  className = '',
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  blur?: number;
  className?: string;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // useInViewOrStacked: inside a <StackPanel>, Framer's useInView never
  // reports true this deep in a sticky ancestor (confirmed against a plain
  // IntersectionObserver on the same node, which does), so treat it as
  // always visible there — the panel's own stacking motion is the entrance.
  // Only the bottom edge is excluded (delays the trigger slightly as content
  // rises into view). The top edge must NOT be excluded — a symmetric
  // margin here used to strand already-on-screen content at opacity:0
  // forever after a fast scroll (common on laptop trackpads) landed an
  // element's top inside the excluded band before it was ever observed
  // crossing into the "active" zone.
  const inView = useInViewOrStacked(ref, { once, margin: '0px 0px -12% 0px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y, filter: `blur(${blur}px)` }}
      animate={inView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* Stagger container + item */
export function Stagger({ children, className = '', gap = 0.09 }: { children: ReactNode; className?: string; gap?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewOrStacked(ref, { once: true, margin: '0px 0px -10% 0px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export const staggerItem = {
  hidden: { opacity: 0, y: 26, filter: 'blur(10px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const } },
};

/* ------------------------------------------------------------------ */
/* Word-by-word headline reveal                                        */
/* ------------------------------------------------------------------ */
export function RevealWords({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInViewOrStacked(ref, { once: true, margin: '0px 0px -10% 0px' });
  return (
    <span ref={ref} className={className}>
      {text.split(' ').map((w, i) => (
        // Extra bottom room (cancelled by the negative margin) keeps descenders like "g" from being clipped.
        <span key={i} className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: '110%', opacity: 0 }}
            animate={inView ? { y: '0%', opacity: 1 } : {}}
            transition={{ duration: 0.85, delay: delay + i * 0.055, ease: [0.22, 1, 0.36, 1] }}
          >
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* MagneticButton — cursor attraction + soft glow                      */
/* ------------------------------------------------------------------ */
export function Magnetic({ children, strength = 0.35, className = '' }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 20, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 260, damping: 20, mass: 0.4 });

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      className={`inline-block ${className}`}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Counter — animated number count-up                                  */
/* ------------------------------------------------------------------ */
export function Counter({
  to,
  suffix = '',
  prefix = '',
  decimals = 0,
  duration = 1800,
  className = '',
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInViewOrStacked(ref, { once: true, margin: '0px 0px -20% 0px' });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}{val.toFixed(decimals)}{suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Parallax — scroll-linked depth                                      */
/* ------------------------------------------------------------------ */
export function Parallax({ children, amount = 60, className = '' }: { children: ReactNode; amount?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [amount, -amount]);
  const sy = useSpring(y, { stiffness: 90, damping: 26 });
  return (
    <motion.div ref={ref} style={{ y: sy }} className={className}>
      {children}
    </motion.div>
  );
}
