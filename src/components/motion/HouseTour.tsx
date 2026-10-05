import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { smoothScrollTo } from './useSmoothScroll';

/**
 * House tour — after the hero, every section sits behind its own door:
 *
 *   1. a room comes into view, door shut, with the section's name over it;
 *   2. scrolling walks you up to the door, and it swings open on its hinges —
 *      and through the doorway is the section itself, a little further off;
 *   3. you walk on through: the doorway grows past the edges of the screen and
 *      the section comes up to full size, filling it;
 *   4. read the section, and as it scrolls away the next door is waiting.
 *
 * The door is 2.5D, built from a door-shut photo of the room: the photo is the
 * back layer, the section shows through the doorway (clipped to it), and the
 * door leaves — cut from the same photo — swing in CSS 3D on a layer above,
 * with anything standing in front of the door (a lamp, a vase, the end of a
 * bed) lifted out of the photo and laid on top, so the door swings behind it.
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
  /** Big title over the door (defaults to `caption`), the small line above it, and the hint below it. */
  title?: string;
  kicker?: string;
  hint?: string;
  /** Width / height of the photo, if it isn't the house set's 2752 × 1536. */
  aspect?: number;
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
  // the front of the house: where the page opens, before the hero
  entrance: { key: 'entrance', name: 'The Front Door', caption: 'Home', title: 'Think Decor', kicker: 'Welcome home', hint: 'Scroll to enter',
    image: '/assets/house/entrance-closed.jpg', closed: '/assets/house/entrance-closed.jpg', aspect: 2048 / 1152,
    leaves: [L([0.4437, 0.3582, 0.5018, 0.727]), R([0.5018, 0.3582, 0.5597, 0.727])] },
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
    leaves: [L([0.353, 0.284, 0.485, 0.749])] },
  reading: { key: 'reading', name: 'The Reading Nook', caption: 'Questions & answers', image: '/assets/house/reading.jpg', closed: '/assets/house/reading-closed.jpg',
    leaves: [L([0.4575, 0.193, 0.645, 0.771])] },
  loft: { key: 'loft', name: 'The Loft', caption: 'Measure & plan', image: '/assets/house/loft.jpg', closed: '/assets/house/loft-closed-1k.jpg',
    leaves: [L([0.419, 0.302, 0.5, 0.739]), R([0.5, 0.302, 0.581, 0.739])] },
  garden: { key: 'garden', name: 'The Garden Room', caption: 'Start your room', image: '/assets/house/garden.jpg', closed: '/assets/house/garden-closed.jpg',
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
/** What stands in front of a door: lifted-out pieces to lay on top, and per-leaf masks so the leaves don't carry them. */
type Front = { overlays: Overlay[]; leafMasks: string[] };

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = rej;
  i.src = src;
});

/** Square erode (keep = 0) or dilate (keep = 1) of a 0/1 bitmap, radius r, as two 1D passes. */
function morph(src: Uint8Array, w: number, h: number, r: number, keep: 0 | 1) {
  const pass = (a: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(a.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 1 - keep;
      for (let k = -r; k <= r && v !== keep; k++) {
        const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
        const inside = xx >= 0 && yy >= 0 && xx < w && yy < h;
        if ((inside ? a[yy * w + xx] : 0) === keep) v = keep;
      }
      out[y * w + x] = v;
    }
    return out;
  };
  return pass(pass(src, true), false);
}

const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/**
 * Lifts out whatever is in front of the door: pixels inside `front` boxes that
 * match in the open and shut photos. Works on the shut photo (the one on screen).
 */
async function frontOf(room: Room): Promise<Front> {
  if (!room.front?.length) return { overlays: [], leafMasks: room.leaves.map(() => '') };
  const [open, shut] = await Promise.all([loadImage(room.image), loadImage(room.closed)]);
  const W = shut.naturalWidth, H = shut.naturalHeight;
  const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const rect = (b: Box) => {
    const x = Math.round(b[0] * W), y = Math.round(b[1] * H);
    return [x, y, Math.max(1, Math.round(b[2] * W) - x), Math.max(1, Math.round(b[3] * H) - y)] as const;
  };

  // one full-size map: opaque where something stands in front of the door
  const same = canvas(W, H);
  const sctx = same.getContext('2d')!;
  for (const b of room.front) {
    const [x, y, w, h] = rect(b);
    const a = canvas(w, h).getContext('2d', { willReadFrequently: true })!;
    const c = canvas(w, h).getContext('2d', { willReadFrequently: true })!;
    a.drawImage(open, (x / W) * open.naturalWidth, (y / H) * open.naturalHeight, (w / W) * open.naturalWidth, (h / H) * open.naturalHeight, 0, 0, w, h);
    c.drawImage(shut, x, y, w, h, 0, 0, w, h);
    const da = a.getImageData(0, 0, w, h).data, dc = c.getImageData(0, 0, w, h).data;
    let bits = new Uint8Array(w * h);
    for (let i = 0; i < bits.length; i++) {
      const j = i * 4;
      bits[i] = Math.abs(da[j] - dc[j]) + Math.abs(da[j + 1] - dc[j + 1]) + Math.abs(da[j + 2] - dc[j + 2]) < 72 ? 1 : 0;
    }
    // drop stray specks (a patch of door that happens to match) and keep solid objects:
    // shrink the match by a few pixels, then grow it back
    const r = Math.max(2, Math.round(W / 700));
    bits = morph(morph(bits, w, h, r, 0), w, h, r, 1);
    // …then fill the small holes inside what's left, so objects come out solid
    bits = morph(morph(bits, w, h, r * 4, 1), w, h, r * 4, 0);
    const mask = new ImageData(w, h);
    for (let i = 0; i < bits.length; i++) mask.data[i * 4 + 3] = bits[i] ? 255 : 0;
    const m = canvas(w, h);
    m.getContext('2d')!.putImageData(mask, 0, 0);
    sctx.filter = 'blur(1.2px)'; // soften the cut so its edge doesn't fizz
    sctx.drawImage(m, x, y);
    sctx.filter = 'none';
  }

  const overlays = room.front.map((b) => {
    const [x, y, w, h] = rect(b);
    const out = canvas(w, h);
    const ctx = out.getContext('2d')!;
    ctx.drawImage(shut, x, y, w, h, 0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(same, x, y, w, h, 0, 0, w, h);
    return { box: b, url: out.toDataURL('image/png') };
  });

  const leafMasks = room.leaves.map((l) => {
    if (!room.front!.some((f) => overlaps(f, l.box))) return '';
    const [x, y, w, h] = rect(l.box);
    const out = canvas(w, h);
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(same, x, y, w, h, 0, 0, w, h);
    return out.toDataURL('image/png');
  });
  return { overlays, leafMasks };
}

/** All generated room photos share one aspect ratio (2752 × 1536). */
const IMAGE_ASPECT = 2752 / 1536;

/** Scroll lengths, in viewport heights: the walk up to the door (it opens on the way), and the step through. */
const WALK_VH = 1.15;
const OPEN_VH = 0.9;

/** Along the walk (0–1): when the door starts and finishes opening. */
const DOOR_FROM = 0.14;
const DOOR_TO = 0.72;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const inOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const pct = (x: number) => `${(x * 100).toFixed(3)}%`;

/* ---------------- registry: rooms, in page order ---------------- */

interface Entry { el: HTMLElement; section: HTMLElement; inner: HTMLElement; veil: HTMLElement; room: RoomKey }
let entries: Entry[] = [];

/**
 * Where a room's photo — and its doorway — sit on screen. The photo is
 * cover-fitted, so on a narrow (portrait) screen its sides are cropped and a
 * doorway near the edge could fall off-screen — the photo is then slid
 * sideways (within its own overflow) so the door stays comfortably in view.
 */
function photoOnScreen(room: Room, W: number, H: number) {
  const R = W / H, A = room.aspect ?? IMAGE_ASPECT;
  let w = W, h = H, oy = 0;
  if (R < A) { h = H; w = H * A; }
  else { w = W; h = W / A; oy = (H - h) / 2; }
  const [dx, dy] = doorPoint(room);
  let ox = (W - w) / 2;
  if (w > W + 1) {
    const want = Math.min(Math.max(ox + dx * w, W * 0.3), W * 0.7);
    ox = Math.min(0, Math.max(W - w, want - dx * w));
  }
  return { ox, oy, w, h, sx: ox + dx * w, sy: oy + dy * h };
}

/**
 * The camera for one room at one moment. You walk up to the door (framing it
 * at about half the screen width) while it swings open, then walk through it:
 * the zoom carries on until the doorway is bigger than the screen.
 *
 * `door` is the doorway's rectangle on screen; `k` is how big the section
 * behind it is drawn — it's further away than the door, so it grows more
 * slowly, and reaches full size exactly as the doorway fills the screen.
 */
function camera(room: Room, W: number, H: number, walk: number, open: number) {
  const p = photoOnScreen(room, W, H);
  const d = doorBox(room);
  const cx = p.sx, cy = p.sy;
  const X0 = p.ox + d[0] * p.w, X1 = p.ox + d[2] * p.w, Y0 = p.oy + d[1] * p.h, Y1 = p.oy + d[3] * p.h;
  const atDoor = Math.min(2, Math.max(1.06, (W * 0.5) / (X1 - X0)));
  const cover = 1.03 * Math.max(cx / (cx - X0), (W - cx) / (X1 - cx), cy / (cy - Y0), (H - cy) / (Y1 - cy), atDoor * 1.2);
  const approach = inOut(clamp01(walk / DOOR_TO));
  // the step through, in scroll distance: the end of the walk plus the whole open stretch
  const through = clamp01(((walk - DOOR_TO) * WALK_VH + open * OPEN_VH) / ((1 - DOOR_TO) * WALK_VH + OPEN_VH));
  const S = (1.03 + (atDoor - 1.03) * approach) * Math.pow(cover / atDoor, inOut(through));
  const bob = Math.sin(walk * Math.PI * 7) * 2.5 * (1 - through) * (walk > 0 ? 1 : 0);
  const at = (x: number, y: number) => [cx + (x - cx) * S, cy + (y - cy) * S + bob] as const;
  const [a0, b0] = at(X0, Y0), [a1, b1] = at(X1, Y1);
  return { p, cx, cy: cy + bob, S, bob, through, door: [a0, b0, a1, b1] as Box, k: through >= 1 ? 1 : Math.pow(S / cover, 0.75) };
}

interface TourState {
  index: number;
  room: RoomKey | null;
  /** How far the room's block has scrolled past the top of the screen (px; negative = still arriving). */
  top: number;
  /** 0 → 1 while walking up to the door (the door opens on the way). */
  walk: number;
  /** 0 → 1 while stepping through it. */
  open: number;
}

/** Which room you're in (the last one whose block has come on screen) and how far along you are. */
function readTour(H: number): TourState {
  let s: TourState = { index: -1, room: null, top: 0, walk: 0, open: 0 };
  entries.forEach((e, i) => {
    const top = e.el.getBoundingClientRect().top;
    if (top >= H) return;
    const walkLen = WALK_VH * H, openLen = OPEN_VH * H;
    s = { index: i, room: e.room, top, walk: clamp01(-top / walkLen), open: clamp01((-top - walkLen) / openLen) };
  });
  return s;
}

/* ---------------- the door ---------------- */

/**
 * One room's door leaves (and anything standing in front of them), in the
 * photo's own coordinates. This sits above the section, which shows through
 * the doorway behind it. Hidden unless it's the room you're in.
 */
function DoorRig({ room }: { room: Room }) {
  const [front, setFront] = useState<Front>({ overlays: [], leafMasks: [] });
  useEffect(() => {
    let live = true;
    // after first paint, so lifting the furniture out never holds up the page
    const id = window.setTimeout(() => { frontOf(room).then((f) => live && setFront(f)).catch(() => {}); }, 400);
    return () => { live = false; window.clearTimeout(id); };
  }, [room]);

  const d = doorBox(room);
  return (
    <div data-rig={room.key} className="absolute inset-0" style={{ display: 'none' }}>
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
                ...(front.leafMasks[i] ? { maskImage: `url(${front.leafMasks[i]})`, WebkitMaskImage: `url(${front.leafMasks[i]})`, maskSize: '100% 100%', WebkitMaskSize: '100% 100%' } : {}),
              }}
            >
              {/* turning out of the light: the leaf darkens as it swings, deepest at the free edge */}
              <div
                className="absolute inset-0 opacity-0"
                style={{ background: `linear-gradient(${l.hinge === 'left' ? '90deg' : '270deg'}, rgba(20,16,10,0.2), rgba(12,10,6,0.55))` }}
              />
              {/* the leaf's thickness: a sliver of edge along the free side */}
              <div
                className={cn('absolute inset-y-0 w-[3px] opacity-0', l.hinge === 'left' ? 'right-0' : 'left-0')}
                style={{ background: 'linear-gradient(180deg, rgba(255,250,240,0.75), rgba(200,190,170,0.55))' }}
              />
            </div>
          );
        })}
      </div>
      {front.overlays.map((o, i) => (
        <img
          key={i}
          alt=""
          src={o.url}
          className="absolute"
          style={{ left: pct(o.box[0]), top: pct(o.box[1]), width: pct(o.box[2] - o.box[0]), height: pct(o.box[3] - o.box[1]) }}
        />
      ))}
    </div>
  );
}

/* ---------------- the camera ---------------- */

/**
 * Three fixed layers around the sections:
 *   below — the room, door shut (the photo);
 *   the section you're walking into, clipped to the doorway (it's in the page, see RoomEntry);
 *   above — the door leaves swinging open, and anything standing in front of them.
 * Both photo layers get the same camera transform, so the doorway lines up exactly.
 */
export function TourBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const topLayerRef = useRef<HTMLDivElement>(null);
  const topPlateRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const kickerRef = useRef<HTMLParagraphElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // warm the cache so a room is never empty when you walk in
    Object.values(ROOMS).forEach((r) => { new Image().src = r.closed; });

    let raf = 0;
    let current: RoomKey | null = null;
    let rig: HTMLElement | null = null;
    let plateBox = '';

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const root = rootRef.current, layer = layerRef.current, plate = plateRef.current, photo = photoRef.current;
      const top = topRef.current, topLayer = topLayerRef.current, topPlate = topPlateRef.current;
      const title = titleRef.current, kicker = kickerRef.current, name = nameRef.current, hint = hintRef.current;
      if (!root || !layer || !plate || !photo || !top || !topLayer || !topPlate || !title || !kicker || !name || !hint) return;
      const W = window.innerWidth, H = window.innerHeight;
      const s = readTour(H);

      // each section: hidden until you're at its door, then seen through the doorway, then the whole screen
      entries.forEach((e) => {
        const room: Room = ROOMS[e.room];
        const t = e.el.getBoundingClientRect().top;
        const walk = clamp01(-t / (WALK_VH * H));
        const open = clamp01((-t - WALK_VH * H) / (OPEN_VH * H));
        const sec = e.section, inner = e.inner;
        if (t > 0.5) {
          sec.style.clipPath = 'inset(50%)';
          return;
        }
        const cam = camera(room, W, H, walk, open);
        if (cam.through >= 1) {
          if (sec.style.clipPath) { sec.style.clipPath = ''; inner.style.transform = ''; e.veil.style.opacity = '0'; }
          return;
        }
        const secTop = sec.getBoundingClientRect().top;
        const [x0, y0, x1, y1] = cam.door;
        // a hair bigger than the doorway so no seam shows against the frame
        sec.style.clipPath = `polygon(${(x0 - 1).toFixed(1)}px ${(y0 - 1 - secTop).toFixed(1)}px, ${(x1 + 1).toFixed(1)}px ${(y0 - 1 - secTop).toFixed(1)}px, ${(x1 + 1).toFixed(1)}px ${(y1 + 1 - secTop).toFixed(1)}px, ${(x0 - 1).toFixed(1)}px ${(y1 + 1 - secTop).toFixed(1)}px)`;
        inner.style.transformOrigin = `${cam.cx.toFixed(1)}px ${(cam.cy - secTop).toFixed(1)}px`;
        inner.style.transform = `scale(${cam.k.toFixed(4)})`;
        // the far side of a doorway is a touch dimmer until you're through it
        e.veil.style.opacity = ((1 - cam.through) * 0.16).toFixed(3);
      });

      if (!s.room) { root.style.visibility = top.style.visibility = title.style.visibility = 'hidden'; return; }
      root.style.visibility = title.style.visibility = 'visible';
      const room: Room = ROOMS[s.room];
      if (current !== s.room) {
        current = s.room;
        photo.src = room.closed;
        if (rig) rig.style.display = 'none';
        rig = topPlate.querySelector<HTMLElement>(`[data-rig="${room.key}"]`);
        if (rig) rig.style.display = '';
        // numbered stops are the sections; a room with its own kicker (the front door) isn't counted
        const numbered = entries.filter((e) => !(ROOMS[e.room] as Room).kicker);
        const n = numbered.findIndex((e) => e.room === s.room);
        kicker.textContent = room.kicker ?? `${String(n + 1).padStart(2, '0')} / ${String(numbered.length).padStart(2, '0')}`;
        name.textContent = room.title ?? room.caption;
        hint.textContent = room.hint ?? 'Scroll to step inside';
      }

      const cam = camera(room, W, H, s.walk, s.open);
      const p = cam.p;
      const box = `${p.ox.toFixed(1)},${p.oy.toFixed(1)},${p.w.toFixed(1)},${p.h.toFixed(1)}`;
      if (box !== plateBox) {
        plateBox = box;
        const st = { left: `${p.ox}px`, top: `${p.oy}px`, width: `${p.w}px`, height: `${p.h}px` };
        Object.assign(plate.style, st);
        Object.assign(topPlate.style, st);
      }
      const origin = `${cam.cx.toFixed(1)}px ${(cam.cy - cam.bob).toFixed(1)}px`;
      const transform = `translateY(${cam.bob.toFixed(2)}px) scale(${cam.S.toFixed(4)})`;
      layer.style.transformOrigin = topLayer.style.transformOrigin = origin;
      layer.style.transform = topLayer.style.transform = transform;
      // once you're through the door, the room is behind you
      root.style.visibility = cam.through >= 1 ? 'hidden' : 'visible';

      // the door: swings open on its hinges as you walk up to it
      const dp = clamp01((s.walk - DOOR_FROM) / (DOOR_TO - DOOR_FROM));
      const deg = inOut(dp) * (room.swing === 'out' ? 84 : 80);
      top.style.visibility = s.top <= 0 && cam.through < 1 ? 'visible' : 'hidden';
      // the door and whatever stood in front of it pass out of view as you step through
      top.style.opacity = (1 - clamp01((cam.through - 0.3) / 0.35)).toFixed(3);
      if (rig) {
        const stage = rig.firstElementChild as HTMLElement | null;
        if (stage) stage.style.perspective = `${(p.w * 0.5).toFixed(0)}px`;
        rig.querySelectorAll<HTMLElement>('[data-leaf]').forEach((leaf) => {
          // rotateY(+) sends a leaf's right side away from you (checked: a left leaf at -40° projects taller)
          const sign = (leaf.dataset.leaf === 'left' ? 1 : -1) * (room.swing === 'out' ? -1 : 1);
          leaf.style.transform = deg > 0.01 ? `rotateY(${(sign * deg).toFixed(2)}deg)` : '';
          const turn = Math.sin((deg * Math.PI) / 180);
          const shade = leaf.firstElementChild as HTMLElement | null;
          if (shade) shade.style.opacity = (turn * (room.swing === 'out' ? 0.4 : 0.8)).toFixed(3);
          const edge = shade?.nextElementSibling as HTMLElement | null;
          if (edge) edge.style.opacity = (Math.min(1, turn * 3) * 0.9).toFixed(3);
        });
      }

      // the section's name: arrives as the room comes into view, leaves as the door starts to open
      const arrive = clamp01((H * 0.6 - s.top) / (H * 0.5));
      const leave = clamp01((s.walk - 0.06) / 0.16);
      title.style.opacity = (arrive * (1 - leave)).toFixed(3);
      title.style.transform = `translateY(${((1 - arrive) * 26 - leave * 34).toFixed(1)}px) scale(${(1 - leave * 0.05).toFixed(3)})`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div ref={rootRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0d1513]" style={{ visibility: 'hidden' }}>
        <div ref={layerRef} className="absolute inset-0 will-change-transform">
          <div ref={plateRef} className="absolute">
            <img ref={photoRef} alt="" className="absolute inset-0 h-full w-full" />
          </div>
        </div>
        {/* a soft lens vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,22,19,0.4))]" />
      </div>
      <div ref={topRef} aria-hidden className="pointer-events-none fixed inset-0 z-[20] overflow-hidden" style={{ visibility: 'hidden' }}>
        <div ref={topLayerRef} className="absolute inset-0 will-change-transform">
          <div ref={topPlateRef} className="absolute">
            {(Object.values(ROOMS) as Room[]).map((r) => <DoorRig key={r.key} room={r} />)}
          </div>
        </div>
      </div>
      {/* the section's name, over the door */}
      <div ref={titleRef} aria-hidden className="pointer-events-none fixed inset-x-0 top-[30svh] z-[25] flex justify-center px-6 opacity-0" style={{ visibility: 'hidden' }}>
        <div className="text-center text-white [text-shadow:0_4px_30px_rgba(0,0,0,0.6)]">
          <p ref={kickerRef} className="font-label text-[11px] font-bold uppercase tracking-[0.3em] text-[#8FE3D4]" />
          <h2 ref={nameRef} className="mt-3 font-display text-[clamp(2.8rem,7vw,6rem)] font-medium leading-[0.95]" />
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/25 px-4 py-1.5 text-[13px] font-medium backdrop-blur-md">
            <span ref={hintRef}>Scroll to step inside</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M6 2v8m0 0L2.5 6.5M6 10l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </p>
        </div>
      </div>
    </>
  );
}

/* ---------------- one section, behind its own door ---------------- */

export function RoomEntry({
  room,
  children,
  id,
  className,
  tone = 'bg-background',
}: {
  room: RoomKey;
  /** Kept for call sites; rooms are numbered in page order. */
  number?: number;
  children: ReactNode;
  /** DOM id for the section (kept for existing nav / footer anchors). */
  id?: string;
  /** Classes for the section itself (background, padding). */
  className?: string;
  /** Background behind the section while it's still small in the doorway (defaults to the page background). */
  tone?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const r = ROOMS[room];

  useLayoutEffect(() => {
    const el = ref.current, section = sectionRef.current, inner = innerRef.current, veil = veilRef.current;
    if (!el || !section || !inner || !veil) return;
    const entry: Entry = { el, section, inner, veil, room };
    entries.push(entry);
    entries.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return () => { entries = entries.filter((e) => e !== entry); };
  }, [room]);

  // a link to this section (#faq…) lands you inside it, not at its closed door
  useEffect(() => {
    if (!id) return;
    const go = () => {
      if (window.location.hash !== `#${id}` || !ref.current) return;
      smoothScrollTo(ref.current.getBoundingClientRect().top + window.scrollY + (WALK_VH + OPEN_VH) * window.innerHeight);
    };
    const t = window.setTimeout(go, 300);
    window.addEventListener('hashchange', go);
    return () => { window.clearTimeout(t); window.removeEventListener('hashchange', go); };
  }, [id]);

  return (
    <div ref={ref} data-room={room} id={`room-${room}`} className="relative" aria-label={r.caption}>
      {/* the section holds still (sticky) while you walk up to its door and through it */}
      <div ref={sectionRef} id={id} className={cn('sticky top-0 z-[1]', tone)} style={{ clipPath: 'inset(50%)' }}>
        <div ref={innerRef} className={cn('relative flex min-h-[100svh] flex-col justify-center will-change-transform', className)}>
          {children}
        </div>
        <div ref={veilRef} aria-hidden className="pointer-events-none absolute inset-0 bg-[#0b1412] opacity-0" />
      </div>
      <div aria-hidden style={{ height: `${(WALK_VH + OPEN_VH) * 100}svh` }} />
    </div>
  );
}
