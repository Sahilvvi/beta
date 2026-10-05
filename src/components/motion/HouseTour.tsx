import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * House tour — the homepage is walked like a home. Every section lives behind
 * a door in its own room:
 *
 *   1. you're standing in the room (full-screen photo), its door shut, and its name appears;
 *   2. scrolling walks you towards the door — and the door swings open as you
 *      approach, showing the next room through it;
 *   3. you step through: a white circle opens from the doorway and grows until
 *      it fills the screen — and inside it is the section;
 *   4. read the section, and as it scrolls away the next room is waiting.
 *
 * <TourBackdrop> is the fixed camera (the room photo, the door and the walk), and
 * <RoomEntry> wraps each section: a walk-in stretch, then the section itself,
 * which holds still (sticky) while the circle opens over it.
 *
 * The door is 2.5D, built from two photos of the same room — door open and door
 * shut. The open photo is the base. Over it sits the shut photo with a hole
 * where the doorway is, and the door leaves themselves, cut from the shut photo
 * and swung on their hinges in CSS 3D. Anything standing in front of the door
 * (a lamp, a vase, the end of a bed) is lifted out of the photos and laid on
 * top, so the door swings behind it. Once the door is open the shut photo fades
 * away, leaving the real open-door photo for the step through.
 */

/** A rectangle in a room photo, as fractions of its width/height: [left, top, right, bottom]. */
type Box = [number, number, number, number];

interface Leaf {
  box: Box;
  /** Which edge the leaf is hinged on. */
  hinge: 'left' | 'right';
}

export interface Room {
  key: string;
  name: string;
  /** What's behind this room's door — the section's name. */
  caption: string;
  /** The room with its door open (the next room visible through it). */
  image: string;
  /** The same photo with the door shut — the leaves are cut from this and swung open. */
  closed: string;
  leaves: Leaf[];
  /** Which way the door opens: away from you into the next room (default), or towards you. */
  swing?: 'in' | 'out';
  /**
   * Things standing in front of the door (pendant lamps, a vase, the end of a bed…).
   * Inside these boxes the two photos are compared pixel by pixel: whatever is the
   * same in both is in front of the door, so it's laid over the swinging leaves.
   */
  front?: Box[];
}

const L = (box: Box): Leaf => ({ box, hinge: 'left' });
const R = (box: Box): Leaf => ({ box, hinge: 'right' });

// One house: every room was generated as a set (same architecture, oak floors, sage panelling,
// teal + brass accents, afternoon light, eye-level one-point view) so the walk reads as one home.
// Each room also has a door-shut edit of the same photo; leaf boxes were measured on those.
export const ROOMS = {
  living: { key: 'living', name: 'The Living Room', caption: 'Welcome in', image: '/assets/house/living.jpg', closed: '/assets/house/living-closed.jpg',
    leaves: [L([0.425, 0.25, 0.504, 0.70]), R([0.504, 0.25, 0.581, 0.70])], swing: 'out', front: [[0.4, 0.675, 0.62, 0.78]] },
  hallway: { key: 'hallway', name: 'The Hallway', caption: 'How it works', image: '/assets/house/hallway.jpg', closed: '/assets/house/hallway-closed.jpg',
    leaves: [L([0.406, 0.224, 0.502, 0.728]), R([0.502, 0.224, 0.598, 0.728])] },
  studio: { key: 'studio', name: 'The Studio', caption: 'Design with Mantha', image: '/assets/house/studio.jpg', closed: '/assets/house/studio-closed.jpg',
    leaves: [L([0.6225, 0.197, 0.756, 0.739]), R([0.756, 0.197, 0.894, 0.739])], front: [[0.58, 0.55, 0.8, 0.75]] },
  bedroom: { key: 'bedroom', name: 'The Bedroom', caption: 'How people use it', image: '/assets/house/bedroom.jpg', closed: '/assets/house/bedroom-closed.jpg',
    leaves: [L([0.415, 0.25, 0.497, 0.672]), R([0.497, 0.25, 0.581, 0.672])], front: [[0.4, 0.6, 0.55, 0.68]] },
  kitchen: { key: 'kitchen', name: 'The Kitchen', caption: 'About Think Decor', image: '/assets/house/kitchen.jpg', closed: '/assets/house/kitchen-closed.jpg',
    // the island hides the bottom of the doors, so the leaves stop at its worktop
    leaves: [L([0.408, 0.268, 0.5, 0.556]), R([0.5, 0.268, 0.592, 0.556])], front: [[0.37, 0.2, 0.63, 0.32]] },
  dining: { key: 'dining', name: 'The Dining Room', caption: 'How we compare', image: '/assets/house/dining.jpg', closed: '/assets/house/dining-closed.jpg',
    leaves: [L([0.374, 0.185, 0.5015, 0.558]), R([0.5015, 0.185, 0.6285, 0.558])],
    front: [[0.43, 0.15, 0.57, 0.34], [0.44, 0.34, 0.56, 0.6], [0.36, 0.52, 0.65, 0.6]] },
  snug: { key: 'snug', name: 'The Snug', caption: 'Pricing', image: '/assets/house/snug.jpg', closed: '/assets/house/snug-closed.jpg',
    leaves: [L([0.353, 0.284, 0.485, 0.749])], front: [[0.47, 0.55, 0.53, 0.77]] },
  reading: { key: 'reading', name: 'The Reading Nook', caption: 'Questions', image: '/assets/house/reading.jpg', closed: '/assets/house/reading-closed.jpg',
    leaves: [L([0.4575, 0.193, 0.645, 0.771])] },
  loft: { key: 'loft', name: 'The Loft', caption: 'Coming soon', image: '/assets/house/loft.jpg', closed: '/assets/house/loft-closed-1k.jpg',
    leaves: [L([0.419, 0.302, 0.5, 0.739]), R([0.5, 0.302, 0.581, 0.739])] },
  garden: { key: 'garden', name: 'The Garden Room', caption: 'Your next room', image: '/assets/house/garden.jpg', closed: '/assets/house/garden-closed.jpg',
    leaves: [L([0.425, 0.336, 0.504, 0.728]), R([0.504, 0.336, 0.581, 0.728])], swing: 'out', front: [[0.49, 0.68, 0.555, 0.79]] },
  study: { key: 'study', name: 'The Study', caption: 'Stories & ideas', image: '/assets/house/study.jpg', closed: '/assets/house/study-closed-1k.jpg',
    leaves: [R([0.506, 0.168, 0.669, 0.81])] },
} satisfies Record<string, Room>;

export type RoomKey = keyof typeof ROOMS;

/** The doorway: the box around all of a room's leaves. */
function doorBox(room: Room): Box {
  return room.leaves.reduce<Box>((b, l) => [Math.min(b[0], l.box[0]), Math.min(b[1], l.box[1]), Math.max(b[2], l.box[2]), Math.max(b[3], l.box[3])], [1, 1, 0, 0]);
}

/** Where you walk to: the middle of the doorway, a little above half height (eye level). */
function doorPoint(room: Room): [number, number] {
  const b = doorBox(room);
  return [(b[0] + b[2]) / 2, b[1] + (b[3] - b[1]) * 0.45];
}

/* ---------------- what's in front of each door ---------------- */

type Overlay = { box: Box; url: string };

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = rej;
  i.src = src;
});

/** Lifts out whatever is in front of the door: pixels inside `front` boxes that match in both photos. */
async function frontOverlays(room: Room): Promise<Overlay[]> {
  if (!room.front?.length) return [];
  const [open, shut] = await Promise.all([loadImage(room.image), loadImage(room.closed)]);
  // work at the open photo's full size; the shut one may be a smaller edit
  const W = open.naturalWidth, H = open.naturalHeight;
  const sx = shut.naturalWidth / W, sy = shut.naturalHeight / H;
  const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  return room.front.map((b) => {
    const x = Math.round(b[0] * W), y = Math.round(b[1] * H);
    const w = Math.max(1, Math.round((b[2] - b[0]) * W)), h = Math.max(1, Math.round((b[3] - b[1]) * H));
    const a = canvas(w, h).getContext('2d', { willReadFrequently: true })!;
    const c = canvas(w, h).getContext('2d', { willReadFrequently: true })!;
    a.drawImage(open, x, y, w, h, 0, 0, w, h);
    c.drawImage(shut, x * sx, y * sy, w * sx, h * sy, 0, 0, w, h);
    const da = a.getImageData(0, 0, w, h).data, dc = c.getImageData(0, 0, w, h).data;
    const mask = new ImageData(w, h);
    for (let i = 0; i < da.length; i += 4) {
      const diff = Math.abs(da[i] - dc[i]) + Math.abs(da[i + 1] - dc[i + 1]) + Math.abs(da[i + 2] - dc[i + 2]);
      mask.data[i + 3] = diff < 48 ? 255 : 0;
    }
    const m = canvas(w, h);
    m.getContext('2d')!.putImageData(mask, 0, 0);
    const out = canvas(w, h);
    const ctx = out.getContext('2d')!;
    ctx.drawImage(open, x, y, w, h, 0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    // soften the cut so its edge doesn't fizz; then fade the box's own border so it never shows
    ctx.filter = 'blur(1.2px)';
    ctx.drawImage(m, 0, 0);
    ctx.filter = 'none';
    return { box: b, url: out.toDataURL('image/png') };
  });
}

/** All generated room photos share one aspect ratio (2752 × 1536). */
const IMAGE_ASPECT = 2752 / 1536;

/** Scroll lengths, in viewport heights: the walk to the door, and the circle opening. */
const WALK_VH = 1.25;
const OPEN_VH = 0.75;

/** Along the walk (0–1): when the door starts and finishes opening. */
const DOOR_FROM = 0.16;
const DOOR_TO = 0.68;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const inOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const out3 = (x: number) => 1 - Math.pow(1 - x, 3);
const in2 = (x: number) => x * x;
const pct = (x: number) => `${(x * 100).toFixed(3)}%`;

/* ---------------- registry: rooms, in page order ---------------- */

interface Entry { el: HTMLElement; section: HTMLElement; title: HTMLElement; room: RoomKey }
let entries: Entry[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * Where a room's photo — and its doorway — sit on screen. The photo is
 * cover-fitted, so on a narrow (portrait) screen its sides are cropped and a
 * doorway near the edge could fall off-screen — the photo is then slid
 * sideways (within its own overflow) so the door stays comfortably in view.
 *
 * Returns the photo's box on screen (`ox`, `oy`, `w`, `h`) and where the
 * doorway lands (`sx`, `sy` — also the zoom origin).
 */
function photoOnScreen(room: Room, W: number, H: number) {
  const R = W / H;
  let w = W, h = H, oy = 0;
  if (R < IMAGE_ASPECT) { h = H; w = H * IMAGE_ASPECT; }
  else { w = W; h = W / IMAGE_ASPECT; oy = (H - h) / 2; }
  const [dx, dy] = doorPoint(room);
  let ox = (W - w) / 2;
  if (w > W + 1) {
    const want = Math.min(Math.max(ox + dx * w, W * 0.3), W * 0.7);
    ox = Math.min(0, Math.max(W - w, want - dx * w));
  }
  return { ox, oy, w, h, sx: ox + dx * w, sy: oy + dy * h };
}

interface TourState {
  index: number;
  room: RoomKey | null;
  /** 0 → 1 while walking from the middle of the room to its door (the door opens on the way). */
  walk: number;
  /** 0 → 1 while the circle opens over the section. */
  open: number;
}

/** Which room you're in (the last one whose walk-in has come on screen) and how far along you are. */
function readTour(H: number): TourState {
  let s: TourState = { index: -1, room: null, walk: 0, open: 0 };
  entries.forEach((e, i) => {
    const top = e.el.getBoundingClientRect().top;
    if (top >= H) return;
    const walkLen = WALK_VH * H, openLen = OPEN_VH * H;
    s = { index: i, room: e.room, walk: clamp01(-top / walkLen), open: clamp01((-top - walkLen) / openLen) };
  });
  return s;
}

/* ---------------- the door ---------------- */

/**
 * One room's door, laid over its open-door photo (in the photo's own
 * coordinates, so percentages are fractions of the photo). Hidden unless it's
 * the room you're in; TourBackdrop drives it through `data-*` hooks.
 */
function DoorRig({ room }: { room: Room }) {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  useEffect(() => {
    let live = true;
    // after first paint, so lifting the furniture out never holds up the page
    const id = window.setTimeout(() => { frontOverlays(room).then((o) => live && setOverlays(o)).catch(() => {}); }, 400);
    return () => { live = false; window.clearTimeout(id); };
  }, [room]);

  const d = doorBox(room);
  // the shut photo with a doorway-shaped hole in it
  const hole = `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${pct(d[0])} ${pct(d[1])}, ${pct(d[2])} ${pct(d[1])}, ${pct(d[2])} ${pct(d[3])}, ${pct(d[0])} ${pct(d[3])}, ${pct(d[0])} ${pct(d[1])})`;

  return (
    <div data-rig={room.key} className="absolute inset-0" style={{ display: 'none' }}>
      <div data-wall className="absolute inset-0" style={{ backgroundImage: `url(${room.closed})`, backgroundSize: '100% 100%', clipPath: hole }} />
      {/* the leaves swing in a shared 3D space, seen from the doorway's middle */}
      <div data-stage className="absolute inset-0" style={{ perspectiveOrigin: `${pct((d[0] + d[2]) / 2)} ${pct((d[1] + d[3]) / 2)}` }}>
        {room.leaves.map((l, i) => {
          const [x0, y0, x1, y1] = l.box;
          const bw = x1 - x0, bh = y1 - y0;
          return (
            <div
              key={i}
              data-leaf={l.hinge}
              className="absolute [backface-visibility:hidden]"
              style={{
                left: pct(x0), top: pct(y0), width: pct(bw), height: pct(bh),
                transformOrigin: `${l.hinge === 'left' ? '0%' : '100%'} 50%`,
                backgroundImage: `url(${room.closed})`,
                backgroundSize: `${pct(1 / bw)} ${pct(1 / bh)}`,
                backgroundPosition: `${pct(x0 / (1 - bw))} ${pct(y0 / (1 - bh))}`,
              }}
            >
              {/* turning out of the light: the leaf darkens as it swings, deepest at the free edge */}
              <div
                data-shade
                className="absolute inset-0 opacity-0"
                style={{ background: `linear-gradient(${l.hinge === 'left' ? '90deg' : '270deg'}, rgba(20,16,10,0.25), rgba(12,10,6,0.6))` }}
              />
              {/* the leaf's thickness: a sliver of edge along the free side */}
              <div
                data-edge
                className={cn('absolute inset-y-0 w-[3px] opacity-0', l.hinge === 'left' ? 'right-0' : 'left-0')}
                style={{ background: 'linear-gradient(180deg, rgba(255,250,240,0.7), rgba(200,190,170,0.5))' }}
              />
            </div>
          );
        })}
      </div>
      {overlays.map((o, i) => (
        <img
          key={i}
          alt=""
          src={o.url}
          data-front
          className="absolute"
          style={{ left: pct(o.box[0]), top: pct(o.box[1]), width: pct(o.box[2] - o.box[0]), height: pct(o.box[3] - o.box[1]) }}
        />
      ))}
    </div>
  );
}

/* ---------------- the camera ---------------- */

export function TourBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const sharpRef = useRef<HTMLImageElement>(null);
  const softRef = useRef<HTMLImageElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // warm the cache so a room is never empty when you walk in
    Object.values(ROOMS).forEach((r) => { new Image().src = r.image; new Image().src = r.closed; });

    let raf = 0;
    let src = '';
    let rig: HTMLElement | null = null;
    let plateBox = '';
    const t0 = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const root = rootRef.current, layer = layerRef.current, plate = plateRef.current;
      const sharp = sharpRef.current, soft = softRef.current, glow = glowRef.current;
      if (!root || !layer || !plate || !sharp || !soft || !glow) return;
      const W = window.innerWidth, H = window.innerHeight;
      const s = readTour(H);

      // each section's clip: hidden until its door opens, a growing circle while it opens, clear after
      entries.forEach((e, i) => {
        const room = ROOMS[e.room];
        const top = e.el.getBoundingClientRect().top;
        const open = clamp01((-top - WALK_VH * H) / (OPEN_VH * H));
        const { sx: cx, sy: cy } = photoOnScreen(room, W, H);
        const secTop = e.section.getBoundingClientRect().top;
        if (open >= 0.999) {
          if (e.section.style.clipPath) e.section.style.clipPath = '';
        } else {
          const far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
          const r = open <= 0 ? 0 : 6 + out3(open) * far;
          e.section.style.clipPath = `circle(${r.toFixed(1)}px at ${cx.toFixed(1)}px ${(cy - secTop).toFixed(1)}px)`;
        }
        // the room's name: arrives as you step into the room, leaves as the door starts to open
        const inRoom = clamp01((H * 0.55 - top) / (H * 0.45));
        const leaving = clamp01((-top / (WALK_VH * H) - 0.22) / 0.2);
        const o = i === s.index ? inRoom * (1 - leaving) : 0;
        e.title.style.opacity = o.toFixed(3);
        e.title.style.transform = `translateY(${((1 - inRoom) * 24 - leaving * 28).toFixed(1)}px) scale(${(1 - leaving * 0.04).toFixed(3)})`;
      });

      if (!s.room) { root.style.visibility = 'hidden'; return; }
      root.style.visibility = 'visible';
      const room: Room = ROOMS[s.room];
      if (src !== room.image) {
        src = room.image;
        sharp.src = soft.src = src;
        if (rig) rig.style.display = 'none';
        rig = plate.querySelector<HTMLElement>(`[data-rig="${room.key}"]`);
        if (rig) rig.style.display = '';
      }

      // the photo, cover-fitted (and panned on narrow screens so the door stays in view)
      const p = photoOnScreen(room, W, H);
      const box = `${p.ox.toFixed(1)},${p.oy.toFixed(1)},${p.w.toFixed(1)},${p.h.toFixed(1)}`;
      if (box !== plateBox) {
        plateBox = box;
        Object.assign(plate.style, { left: `${p.ox}px`, top: `${p.oy}px`, width: `${p.w}px`, height: `${p.h}px` });
      }
      const [cx, cy] = [p.sx, p.sy];

      // the door: swings open on its hinges as you walk up to it
      const dp = clamp01((s.walk - DOOR_FROM) / (DOOR_TO - DOOR_FROM));
      const swing = inOut(dp);
      if (rig) {
        const out = room.swing === 'out';
        const maxDeg = out ? 96 : 86;
        const deg = swing * maxDeg;
        const stage = rig.querySelector<HTMLElement>('[data-stage]');
        if (stage) stage.style.perspective = `${(p.w * 0.9).toFixed(0)}px`;
        // the leaves hand over to the real open-door photo as they reach the wall
        const leafFade = 1 - clamp01((dp - 0.82) / 0.18);
        rig.querySelectorAll<HTMLElement>('[data-leaf]').forEach((leaf) => {
          const left = leaf.dataset.leaf === 'left';
          // rotateY(+) sends a leaf's right side away from you
          const sign = (left ? 1 : -1) * (out ? -1 : 1);
          leaf.style.transform = deg > 0.01 ? `rotateY(${(sign * deg).toFixed(2)}deg)` : '';
          leaf.style.opacity = leafFade.toFixed(3);
          const turn = Math.sin((deg * Math.PI) / 180);
          const shade = leaf.firstElementChild as HTMLElement | null;
          if (shade) shade.style.opacity = (turn * (out ? 0.45 : 0.85)).toFixed(3);
          const edge = shade?.nextElementSibling as HTMLElement | null;
          if (edge) edge.style.opacity = (Math.min(1, turn * 3) * 0.9).toFixed(3);
        });
        // once the door is open, the shut photo (and the lifted-out furniture) fade into the open one
        const settle = 1 - clamp01((dp - 0.88) / 0.12);
        const wall = rig.querySelector<HTMLElement>('[data-wall]');
        if (wall) wall.style.opacity = settle.toFixed(3);
        rig.style.visibility = settle <= 0.001 ? 'hidden' : '';
      }

      // walking to the door: the camera moves towards the doorway (zooming about it, so it
      // stays put on screen), with a faint step bob. Up to the door: frame the doorway at
      // about two-thirds of the screen width, then step through with motion blur.
      const d = doorBox(room);
      const doorPx = (d[2] - d[0]) * p.w;
      const atDoor = Math.min(2.1, Math.max(1.06, (W * 0.62) / doorPx));
      const approach = inOut(clamp01(s.walk / DOOR_TO));
      const through = in2(clamp01((s.walk - DOOR_TO) / (1 - DOOR_TO)));
      const secs = (now - t0) / 1000;
      const breathe = Math.sin(secs * 0.2) * 0.008;
      const scale = (1.03 + breathe + (atDoor - 1.03) * approach) * (1 + through * 0.7) * (1 + out3(s.open) * 1.1);
      const bob = Math.sin(s.walk * Math.PI * 7) * 3 * (1 - s.open) * (s.walk > 0 ? 1 : 0);
      layer.style.transformOrigin = `${cx.toFixed(1)}px ${cy.toFixed(1)}px`;
      layer.style.transform = `translateY(${bob.toFixed(2)}px) scale(${scale.toFixed(4)})`;
      soft.style.opacity = clamp01(through * 0.55 + s.open * 0.6).toFixed(3);

      // light spilling out of the doorway as the section opens
      if (s.open > 0 && s.open < 1) {
        const far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
        const r = 6 + out3(s.open) * far;
        glow.style.visibility = 'visible';
        glow.style.width = glow.style.height = `${(r * 2).toFixed(1)}px`;
        glow.style.left = `${(cx - r).toFixed(1)}px`;
        glow.style.top = `${(cy - r).toFixed(1)}px`;
        glow.style.opacity = (1 - s.open).toFixed(3);
      } else {
        glow.style.visibility = 'hidden';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div ref={rootRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0d1513]" style={{ visibility: 'hidden' }}>
        <div ref={layerRef} className="absolute inset-0 will-change-transform">
          <div ref={plateRef} className="absolute">
            <img ref={sharpRef} alt="" className="absolute inset-0 h-full w-full" />
            {(Object.values(ROOMS) as Room[]).map((r) => <DoorRig key={r.key} room={r} />)}
            <img ref={softRef} alt="" className="absolute inset-0 h-full w-full scale-[1.03] opacity-0 blur-[12px]" />
          </div>
        </div>
        {/* a soft lens vignette keeps the room names legible over any photo */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,22,19,0.45))]" />
      </div>
      {/* the rim of the opening door: light around the growing circle, above the section it reveals */}
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none fixed z-[30] rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_0_60px_18px_rgba(255,248,235,0.75),0_0_160px_60px_rgba(255,240,215,0.35)]"
        style={{ visibility: 'hidden' }}
      />
    </>
  );
}

/* ---------------- one room + the section behind its door ---------------- */

export function RoomEntry({
  room,
  number,
  children,
  id,
  className,
}: {
  room: RoomKey;
  number: number;
  children: ReactNode;
  /** DOM id for the section (kept for existing nav / footer anchors). */
  id?: string;
  /** Background for the section behind the door (defaults to the page background). */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const r = ROOMS[room];

  useLayoutEffect(() => {
    const el = ref.current, section = sectionRef.current, title = titleRef.current;
    if (!el || !section || !title) return;
    const entry: Entry = { el, section, title, room };
    entries.push(entry);
    entries.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    notify();
    return () => { entries = entries.filter((e) => e !== entry); notify(); };
  }, [room]);

  return (
    <div ref={ref} data-room={room} id={`room-${room}`} className="relative">
      {/* the walk across the room to its door; the room's name rides at mid-screen */}
      <div className="relative" style={{ height: `${WALK_VH * 100}svh` }} aria-label={`${r.name}: ${r.caption}`}>
        <div className="sticky top-[34svh] flex justify-center px-6">
          <div ref={titleRef} className="text-center text-white opacity-0 [text-shadow:0_4px_30px_rgba(0,0,0,0.55)]">
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.22em] text-[#8FE3D4]">
              Room {String(number).padStart(2, '0')}
            </p>
            <h2 className="mt-3 font-display text-[clamp(2.6rem,6vw,5.4rem)] font-medium leading-none">{r.name}</h2>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/25 px-4 py-1.5 text-[13px] font-medium backdrop-blur-md">
              {r.caption}
            </p>
          </div>
        </div>
      </div>

      {/* behind the door: the section holds still while the circle opens over it */}
      <div
        ref={sectionRef}
        id={id}
        className={cn('sticky top-0 z-[1] bg-background', className)}
        style={{ clipPath: 'circle(0px at 50% 50%)' }}
      >
        {children}
      </div>
      <div aria-hidden style={{ height: `${OPEN_VH * 100}svh` }} />
    </div>
  );
}

/* ---------------- the house map ---------------- */

/** A mini floor-plan index on the right: which room you're in, and a way to walk straight to another. */
export function RoomMap({ onJump }: { onJump: (y: number) => void }) {
  const [list, setList] = useState<Entry[]>([]);
  const [current, setCurrent] = useState(-1);
  const curRef = useRef(-1);

  useEffect(() => {
    const sync = () => setList([...entries]);
    listeners.add(sync);
    sync();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const i = readTour(window.innerHeight).index;
      if (i !== curRef.current) { curRef.current = i; setCurrent(i); }
    };
    raf = requestAnimationFrame(tick);
    return () => { listeners.delete(sync); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-y-0 right-4 z-40 hidden items-center md:flex">
      <AnimatePresence>
        {current >= 0 && (
          <motion.nav
            aria-label="Rooms"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 14 }}
            className="pointer-events-auto rounded-2xl border border-white/15 bg-[rgba(0,30,26,0.55)] p-2.5 backdrop-blur-xl"
          >
            <p className="mb-1.5 px-1.5 font-label text-[9.5px] font-bold uppercase tracking-[0.2em] text-white/50">The house</p>
            <ul className="grid gap-0.5">
              {list.map((e, i) => (
                <li key={e.room}>
                  <button
                    type="button"
                    onClick={() => onJump(e.el.getBoundingClientRect().top + window.scrollY + 2)}
                    className={cn('group flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors', i === current ? 'bg-white/12' : 'hover:bg-white/8')}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full transition-all', i === current ? 'scale-150 bg-[#8FE3D4]' : 'bg-white/40')} />
                    <span className={cn('whitespace-nowrap font-label text-[11px] font-bold', i === current ? 'text-white' : 'text-white/55 group-hover:text-white/85')}>
                      {ROOMS[e.room].name.replace('The ', '')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
