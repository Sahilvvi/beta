import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, ChevronsLeftRight } from 'lucide-react';
import { Magnetic, Reveal, RevealWords, Stagger, staggerItem } from '@/components/premium/Motion';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DEMO_ROOMS, DEMO_STYLES, type RoomItem, type StyleKey } from '@/lib/heroRooms';

/** How long the "Mantha AI is redesigning…" beat plays before the new photo swaps in. */
const GENERATE_MS = 700;

const MAX_ITEMS = Math.max(...DEMO_ROOMS.map((r) => r.items.length));

/**
 * Hero — an illustrative example room (not the visitor's own photo): tap a
 * dot to see what it is and what it would cost, switch rooms, try a style.
 * Nothing here calls the API; it's a fixed demo, same "illustrative, not
 * live" convention the marquee testimonials use, just for the value prop
 * instead of social proof.
 */
export function HeroStage({ onStageBoxMount }: { onStageBoxMount?: (el: HTMLDivElement | null) => void }) {
  const [roomKey, setRoomKey] = useState(DEMO_ROOMS[0].key);
  // No style selected by default: the stage opens on the plain room photo
  // with its hotspots. Picking a style swaps in that room's AI redesign —
  // the hotspots (tied to the original decor) step aside for it.
  const [styleKey, setStyleKey] = useState<StyleKey | null>(null);
  // While a style is "applying", the stage holds the old photo under a brief
  // Mantha AI processing beat instead of snapping straight to the new one —
  // it reads as a redesign happening, not an instant image swap.
  const [pendingStyle, setPendingStyle] = useState<StyleKey | null>(null);
  const [activeItem, setActiveItem] = useState<{ item: RoomItem; index: number } | null>(null);
  // Nudges the visitor toward the style tiles until they've tried one once.
  const [hasTriedStyle, setHasTriedStyle] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const generateTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (generateTimer.current) window.clearTimeout(generateTimer.current);
  }, []);

  const room = DEMO_ROOMS.find((r) => r.key === roomKey) ?? DEMO_ROOMS[0];
  const styled = styleKey ? room.styles[styleKey] : null;
  const stageImage = styled ?? room;
  const stageKey = `${room.key}:${styleKey ?? 'base'}`;
  const generating = pendingStyle !== null;

  const selectRoom = (key: typeof room.key) => {
    if (generateTimer.current) window.clearTimeout(generateTimer.current);
    setPendingStyle(null);
    setActiveItem(null);
    setStyleKey(null);
    setRoomKey(key);
  };

  const selectStyle = (key: StyleKey) => {
    if (generating) return;
    setActiveItem(null);
    setHasTriedStyle(true);
    if (styleKey === key) {
      setStyleKey(null);
      return;
    }
    setPendingStyle(key);
    generateTimer.current = window.setTimeout(() => {
      setStyleKey(key);
      setPendingStyle(null);
    }, GENERATE_MS);
  };

  const togglePin = (item: RoomItem, index: number) => {
    setActiveItem((cur) => (cur?.index === index ? null : { item, index }));
  };

  // Popover position, clamped to the stage so it never spills off the image edge.
  const popStyle = (() => {
    if (!activeItem || !stageRef.current) return undefined;
    const W = stageRef.current.clientWidth;
    const H = stageRef.current.clientHeight;
    const popW = 220;
    const popH = 118;
    let left = (activeItem.item.x / 100) * W + 18;
    const top = Math.max(8, Math.min((activeItem.item.y / 100) * H - popH / 2, H - popH - 8));
    if (left + popW > W - 8) left = (activeItem.item.x / 100) * W - 18 - popW;
    left = Math.max(8, Math.min(left, W - popW - 8));
    return { left, top };
  })();

  return (
    <section
      id="top"
      className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(170deg,#003B33,#00332C_60%,#002923)] px-[clamp(18px,3.4vw,44px)] pb-[clamp(28px,4vw,48px)] pt-[calc(env(safe-area-inset-top,0px)+104px)] text-white"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 55% at 88% 8%, rgba(0,160,140,.30), transparent 62%), radial-gradient(55% 45% at 0% 100%, rgba(0,89,78,.55), transparent 65%)',
        }}
      />

      <div className="relative grid items-start gap-[clamp(24px,4vw,56px)] lg:grid-cols-[5fr_7fr]">
        {/* ---------------- copy ---------------- */}
        <div className="flex flex-col gap-[22px] pt-2">
          <span className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-[#8FE3D4]">
            AI Room Redesign · Paint · Wallpaper · Floor
          </span>

          <h1 className="font-display text-[clamp(2.75rem,6.2vw,5.5rem)] font-medium leading-[0.98] text-white">
            <RevealWords text="Think it before" className="block" delay={0.1} />
            <span className="block italic font-normal text-[#8FE3D4]">
              <RevealWords text="you buy it." delay={0.22} />
            </span>
          </h1>

          <Reveal delay={0.35}>
            <p className="max-w-[40ch] text-[18px] text-white/75">
              Photograph your room once. See new paint, wallpaper or flooring on your own
              walls, before you spend a penny.
            </p>
          </Reveal>

          <Reveal delay={0.42}>
            <div>
              {/* Moved up from below the stage image, in place of the old Paint/
                  Wallpaper/Floor row. All four in a single row (not 2x2) — the
                  taller 2-row grid was pushing the hero's height out a lot,
                  on both desktop and mobile, for a section that should read at
                  a glance. */}
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="flex items-center gap-1.5 font-label text-[11px] font-bold uppercase tracking-[0.16em] text-[#8FE3D4]">
                  Style templates
                  {!hasTriedStyle && (
                    <motion.span
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Sparkles className="h-3 w-3" />
                    </motion.span>
                  )}
                </span>
                <span className="font-label text-[12px] text-white/60">
                  {generating
                    ? `Redesigning in ${pendingStyle}…`
                    : styleKey
                      ? `${styleKey} selected`
                      : !hasTriedStyle
                        ? 'Tap one — see it redesigned ✨'
                        : 'Tap a style to apply it'}
                </span>
              </div>
              <Stagger className="grid grid-cols-4 gap-2">
                {DEMO_STYLES.map((s, i) => (
                  <motion.li key={s.key} variants={staggerItem} className="relative list-none">
                    {/* Nudges a first-time visitor toward the tiles — a sonar
                        ping on the first tile, same visual language as the
                        hotspot dots. Stops for good once any style is tried. */}
                    {!hasTriedStyle && i === 0 && (
                      <span className="pointer-events-none absolute -inset-1 z-[1] animate-ping rounded-[14px] bg-[#00A08C]/50" />
                    )}
                    <button
                      type="button"
                      aria-pressed={styleKey === s.key}
                      disabled={generating}
                      onClick={() => selectStyle(s.key)}
                      className={cn(
                        'group relative z-[1] block aspect-square w-full overflow-hidden rounded-[12px] shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-shadow disabled:cursor-wait',
                        styleKey === s.key && 'shadow-[0_0_0_2px_#00A08C]',
                        pendingStyle === s.key && 'shadow-[0_0_0_2px_#8FE3D4]',
                      )}
                    >
                      <img src={s.image} alt={s.alt} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,52,45,0)_55%,rgba(0,52,45,0.9))]" />
                      <span className={cn('absolute bottom-1.5 left-1.5 right-1.5 text-left font-label text-[10.5px] font-bold leading-[1.1] text-white', (styleKey === s.key || pendingStyle === s.key) && 'text-[#8FE3D4]')}>
                        {s.label}
                      </span>
                      {pendingStyle === s.key && (
                        <motion.span
                          aria-hidden
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                          className="absolute right-1.5 top-1.5 h-4 w-4 rounded-full border-[1.5px] border-white/30 border-t-[#8FE3D4]"
                        />
                      )}
                    </button>
                  </motion.li>
                ))}
              </Stagger>
            </div>
          </Reveal>

          <Reveal delay={0.48} className="mt-1 flex flex-wrap items-center gap-3">
            <Magnetic>
              <Link
                to="/signup"
                className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-[#00A08C] py-2 pl-7 pr-2 text-[15px] font-semibold text-white shadow-[0_20px_46px_-14px_rgba(0,160,140,0.5)] transition-transform duration-300 hover:scale-[1.03] active:scale-[0.97]"
              >
                <span className="relative">Try it free</span>
                <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/15">
                  <ArrowRight className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-7" />
                  <ArrowRight className="absolute h-4 w-4 -translate-x-7 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0" />
                </span>
              </Link>
            </Magnetic>
          </Reveal>

          <Reveal delay={0.55}>
            <p className="max-w-[48ch] border-t border-white/[0.14] pt-[18px] text-[15px] text-white/70">
              <b className="font-semibold text-white">We are Think Decor</b>, a home-design app
              built around Mantha AI. We help homeowners, renters and designers make décor
              decisions with their eyes open: the real room, the real light, the real price.
            </p>
          </Reveal>
        </div>

        {/*
          ---------------- interactive stage ----------------
          Deliberately not wrapped in <Reveal>: it's part of the hero, so it
          should be visible immediately, and it's tall enough (rooms + styles
          below the fold) that Reveal's viewport-intersection check never
          reliably fires for it — leaving it stuck at opacity:0.
        */}
        <div>
          <figure className="m-0">
            <div
              ref={(el) => { stageRef.current = el; onStageBoxMount?.(el); }}
              className="relative aspect-[1024/765] overflow-hidden rounded-[20px]"
              onClick={() => setActiveItem(null)}
            >
              {/* A redesign is revealed by Mantha's scan line sweeping down over the
                  old photo; going back to the plain room (or switching rooms) crossfades. */}
              <AnimatePresence initial={false}>
                <motion.img
                  key={stageKey}
                  src={stageImage.image}
                  alt={stageImage.alt}
                  initial={styleKey ? { clipPath: 'inset(0% 0% 100% 0%)', scale: 1.04 } : { opacity: 0, scale: 1.06 }}
                  animate={styleKey ? { clipPath: 'inset(0% 0% 0% 0%)', scale: 1 } : { opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: { delay: styleKey ? 0.9 : 0, duration: 0.3 } }}
                  transition={{ duration: styleKey ? 0.95 : 0.65, ease: [0.65, 0, 0.35, 1] }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </AnimatePresence>
              {styleKey && (
                <motion.div
                  key={`scan-${stageKey}`}
                  aria-hidden
                  initial={{ top: '0%', opacity: 1 }}
                  animate={{ top: '100%', opacity: [1, 1, 0] }}
                  transition={{ duration: 0.95, ease: [0.65, 0, 0.35, 1] }}
                  className="pointer-events-none absolute inset-x-0 z-[2] h-[3px] -translate-y-1/2 bg-[#8FE3D4] shadow-[0_0_24px_6px_rgba(143,227,212,0.65),0_0_80px_20px_rgba(0,160,140,0.35)]"
                />
              )}
              {/* Light sweep that plays once per room/style change — a small
                  "reveal" flourish so the swap reads as a redesign, not a
                  blunt image replace. */}
              <motion.div
                key={`sweep-${stageKey}`}
                aria-hidden
                initial={{ x: '-130%', opacity: 0 }}
                animate={{ x: '230%', opacity: [0, 0.5, 0] }}
                transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-1/3 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]"
              />

              {/* "Mantha AI is redesigning…" beat — plays over the old photo
                  for GENERATE_MS before the new one swaps in, so applying a
                  style reads as the AI actually doing something, not an
                  instant image replace. */}
              <AnimatePresence>
                {generating && (
                  <motion.div
                    key="generating"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 overflow-hidden bg-[#00231D]/55 backdrop-blur-[3px]"
                  >
                    <motion.div
                      aria-hidden
                      initial={{ y: '-100%' }}
                      animate={{ y: '420%' }}
                      transition={{ duration: GENERATE_MS / 1000, ease: 'linear' }}
                      className="pointer-events-none absolute inset-x-0 h-1/4 bg-[linear-gradient(180deg,transparent,rgba(143,227,212,0.4),transparent)]"
                    />
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                      className="relative h-11 w-11 rounded-full border-2 border-white/20 border-t-[#8FE3D4]"
                    />
                    <span className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-[#8FE3D4]">
                      Mantha AI redesigning
                    </span>
                    <span className="font-label text-[12px] text-white/75">{pendingStyle}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Once a redesign is showing (and the AI beat is over), the
                  original photo comes back as a draggable "before" layer. */}
              {styleKey && !generating && (
                <CompareDivider key={stageKey} before={room.image} beforeAlt={room.alt} styleLabel={styleKey} />
              )}

              {!styleKey && room.items.map((item, i) => (
                <button
                  key={`${room.key}-${i}`}
                  type="button"
                  aria-label={`${item.name}, ${item.price}`}
                  aria-expanded={activeItem?.index === i}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(item, i);
                  }}
                  className="absolute z-[2] grid h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
                  style={{ left: `${item.x}%`, top: `${item.y}%` }}
                >
                  <span className="absolute inset-[-6px] animate-ping rounded-full border-[1.5px] border-white/80" />
                  <span className={cn('h-2 w-2 rounded-full', activeItem?.index === i ? 'bg-[#00A08C]' : 'bg-[#00594E]')} />
                </button>
              ))}

              {!styleKey && activeItem && popStyle && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute z-[5] w-[220px] rounded-[14px] bg-white p-3.5 text-[#00594E] shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
                  style={popStyle}
                  role="dialog"
                  aria-label={activeItem.item.name}
                >
                  <button
                    type="button"
                    onClick={() => setActiveItem(null)}
                    aria-label="Close"
                    className="absolute right-2 top-1.5 text-[18px] leading-none text-[#4F6F6A]"
                  >
                    ×
                  </button>
                  <h3 className="pr-4 font-display text-[17px] leading-[1.15]">{activeItem.item.name}</h3>
                  <p className="mt-1 text-[13px] leading-[1.4] text-[#4F6F6A]">{activeItem.item.description}</p>
                  <div className="mt-2.5 flex items-center justify-between border-t border-[#D3E6E2] pt-2.5">
                    <span className="font-label text-[10.5px] uppercase tracking-[0.08em] text-[#4F6F6A]">Price</span>
                    <b className="font-display text-[19px]">{activeItem.item.price}</b>
                  </div>
                </motion.div>
              )}
            </div>

            <figcaption className="mt-3 flex justify-between gap-3 font-label text-[12px] tracking-[0.04em] text-white/60">
              <span>
                {styleKey
                  ? `● Drag the handle to compare — or tap another style`
                  : '● Tap a dot to see what it is and what it costs'}
              </span>
              <span>{styleKey ? `${room.label} · ${styleKey}` : `${room.label} · ${room.items.length} items tagged`}</span>
            </figcaption>

            <div role="tablist" aria-label="Choose a room" className="mt-[18px] grid grid-cols-2 gap-2.5">
              {DEMO_ROOMS.map((r) => {
                const selected = r.key === roomKey;
                const pct = Math.round((r.items.length / MAX_ITEMS) * 100);
                return (
                  <button
                    key={r.key}
                    role="tab"
                    aria-selected={selected}
                    onClick={() => selectRoom(r.key)}
                    className={cn(
                      'grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-full py-2.5 pl-[18px] pr-3 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] transition-colors',
                      selected ? 'bg-[#00A08C]' : 'bg-[#08463E] hover:bg-[#0E7466]',
                    )}
                  >
                    <span className="whitespace-nowrap font-label text-[15px] font-bold">{r.label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-white/10">
                      <span
                        className={cn('block h-full rounded-full', selected ? 'bg-white' : 'bg-[linear-gradient(180deg,#7FD3C6,#2FA896)]')}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span
                      className={cn(
                        'grid h-7 min-w-7 place-items-center rounded-full font-label text-[12px]',
                        selected ? 'bg-white text-[#00594E]' : 'bg-white/[0.08]',
                      )}
                    >
                      {r.items.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

/**
 * Before/after divider over a redesign: the original photo is clipped to the
 * left of a draggable handle. It arrives with one short sweep (100% → 50%,
 * then a small nudge) so it's obvious it can be dragged, and stays put after.
 */
function CompareDivider({ before, beforeAlt, styleLabel }: { before: string; beforeAlt: string; styleLabel: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pos = useMotionValue(100); // % of width showing the original
  const clip = useTransform(pos, (v) => `inset(0 ${100 - v}% 0 0)`);
  const left = useTransform(pos, (v) => `${v}%`);
  const dragging = useRef(false);

  useEffect(() => {
    // starts once the scan-line reveal (HeroStage, ~0.95s) has finished
    const controls = animate(pos, [100, 50, 60, 50], { duration: 1.5, delay: 1.05, ease: [0.22, 1, 0.36, 1], times: [0, 0.55, 0.78, 1] });
    return () => controls.stop();
  }, [pos]);

  const setFromEvent = (e: ReactPointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    pos.stop();
    pos.set(Math.min(98, Math.max(2, ((e.clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={boxRef}
      className="absolute inset-0 z-[3] cursor-ew-resize touch-pan-y select-none"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); setFromEvent(e); }}
      onPointerMove={(e) => { if (dragging.current) setFromEvent(e); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <motion.img src={before} alt={beforeAlt} draggable={false} style={{ clipPath: clip }} className="absolute inset-0 h-full w-full object-cover" />
      <motion.div style={{ left }} className="pointer-events-none absolute inset-y-0 w-0">
        <span className="absolute inset-y-0 -left-px w-[2px] bg-white shadow-[0_0_14px_rgba(0,0,0,0.35)]" />
        <span className="absolute left-0 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#00594E] shadow-[0_6px_20px_rgba(0,0,0,0.35)]">
          <ChevronsLeftRight className="h-4 w-4" />
        </span>
      </motion.div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 font-label text-[10.5px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-md">Before</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-[#00A08C]/90 px-2.5 py-1 font-label text-[10.5px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-md">{styleLabel}</span>
    </div>
  );
}
