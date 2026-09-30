import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { Link } from 'react-router-dom';
import {
  AnimatePresence, motion, useReducedMotion,
} from 'framer-motion';
import {
  ArrowLeftRight, ArrowRight, RefreshCw, Sparkles, Upload,
} from 'lucide-react';
import { Reveal, Stagger, staggerItem } from './Motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { downscaleImage } from '@/lib/image';

/** Persisted across visits so the free homepage try is one-per-device, not one-per-tab. */
const DEVICE_ID_KEY = 'thinkdecor_demo_device_id';
function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // Private browsing or blocked storage — still works, just re-prompts each visit.
    return crypto.randomUUID();
  }
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Cycled while a real generation is in flight, so the wait still feels alive. */
const STATUS_LINES = ['Reading your room…', 'Applying the style…', 'Finishing details…'];

const CAPABILITIES = ['Wall paint & wallpaper', 'Flooring swaps', 'Keeps real light & shadow'];

const STEPS = [
  'Stand in a corner, phone level.',
  'Get two walls and the floor in frame.',
  'Daylight works best, lights on is fine.',
];

// The prototype's own template photos — already correctly matched to their
// names (verified frame by frame), just never wired up on this page.
const TEMPLATE_GRID = [
  {
    key: 'nordic-light',
    label: 'Nordic Light',
    tag: 'Paint · Floor',
    image: '/assets/rooms/t-scandi.jpg',
    alt: 'Light Scandinavian dining room',
    swatches: ['#F2EFE9', '#C9B79C', '#8FB5B8'],
  },
  {
    key: 'warm-classic',
    label: 'Warm Classic',
    tag: 'Paint',
    image: '/assets/rooms/t-classic.jpg',
    alt: 'Warm classic living room with fireplace',
    swatches: ['#E8DCC4', '#F6F1E6', '#B7A58B'],
  },
  {
    key: 'evening-noir',
    label: 'Evening Noir',
    tag: 'Paint · Wallpaper',
    image: '/assets/rooms/t-noir.jpg',
    alt: 'Dark moody bedroom lit by lamps',
    swatches: ['#2A2521', '#6E5A45', '#D8C6A8'],
  },
  {
    key: 'soft-japandi',
    label: 'Soft Japandi',
    tag: 'Paint · Floor',
    image: '/assets/rooms/t-japandi.jpg',
    alt: 'Calm bedroom with rattan and plants',
    swatches: ['#F3F1EC', '#CDB892', '#7C8A6A'],
  },
  {
    key: 'harbour-teal',
    label: 'Harbour Teal',
    tag: 'Paint · Textiles',
    image: '/assets/rooms/t-teal.jpg',
    alt: 'Living room with teal sofa and curtains',
    swatches: ['#2F7F86', '#1F1F1F', '#E6D9BF'],
  },
];

// The room shown before a visitor uploads their own — real generation now
// runs against whichever photo is in the box (this sample or their upload).
const SAMPLE_BEFORE = '/assets/samples/empty_room.png';
/** Same rules as the signed-in app (and demo-redesign): anything else can't be generated from. */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type Phase = 'idle' | 'generating' | 'result' | 'used';

/**
 * Design Generator — the homepage's Mantha section. A visitor gets one real,
 * free redesign per device: drop in a photo (or don't — a sample room is
 * already loaded), optionally describe a style, tap "Start recreating," and
 * Mantha actually generates it via the demo-redesign edge function. A second
 * attempt from the same device/IP is turned away with a sign-up nudge
 * instead of a second free generation.
 */
export function DesignGenerator() {
  const reduce = useReducedMotion();
  const [uploaded, setUploaded] = useState<{ url: string; name: string; file: File } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [split, setSplit] = useState(50);
  const [hinted, setHinted] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [statusIndex, setStatusIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);
  const hintTimer = useRef<number | null>(null);
  const statusTimer = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const draggingSeam = useRef(false);
  const deviceId = useRef<string>();
  if (!deviceId.current) deviceId.current = getDeviceId();

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    if (statusTimer.current) window.clearInterval(statusTimer.current);
  }, []);

  const beforeImage = uploaded?.url ?? SAMPLE_BEFORE;

  const showFile = (file: File | undefined) => {
    if (!file || phase !== 'idle') return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please choose a JPG, PNG or WebP photo.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That photo is over 10MB — please use a smaller one.');
      return;
    }
    setError(null);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    setUploaded({ url, name: file.name, file });
  };

  const start = async () => {
    if (phase !== 'idle') return;
    setError(null);
    setPhase('generating');
    setStatusIndex(0);
    setElapsed(0);
    const startedAt = Date.now();
    statusTimer.current = window.setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(secs);
      setStatusIndex(Math.min(STATUS_LINES.length - 1, Math.floor(secs / 6)));
    }, 1000);

    try {
      // Send a ~1.5k-pixel JPEG, not the full phone photo: the upload is many
      // times smaller and Gemini answers noticeably faster, with no visible
      // loss (its output is ~1 MP anyway).
      const source = uploaded ? uploaded.file : await fetch(SAMPLE_BEFORE).then((r) => r.blob());
      const toSend = await downscaleImage(source);
      const imageBase64 = await fileToBase64(toSend);
      const imageMimeType = toSend.type || 'image/png';

      const { data, error: fnError } = await supabase.functions.invoke('demo-redesign', {
        body: { deviceId: deviceId.current, imageBase64, imageMimeType, prompt: prompt.trim() || undefined },
      });
      if (fnError) {
        const context = (fnError as { context?: Response }).context;
        const payload = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
        if (payload?.code === 'demo_used') {
          setPhase('used');
          return;
        }
        throw new Error(payload?.error ?? 'Something went wrong. Please try again.');
      }

      const { imageBase64: outB64, mimeType } = data as { imageBase64: string; mimeType: string };
      setResultImage(`data:${mimeType};base64,${outB64}`);
      setPhase('result');
      setSplit(50);
      setHinted(true);
      hintTimer.current = window.setTimeout(() => setHinted(false), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setPhase('idle');
    } finally {
      if (statusTimer.current) { window.clearInterval(statusTimer.current); statusTimer.current = null; }
    }
  };

  const reset = () => {
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    if (statusTimer.current) window.clearInterval(statusTimer.current);
    setError(null);
    setResultImage(null);
    setPhase('idle');
  };

  const setFromEvent = useCallback((clientX: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setSplit(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }, []);

  return (
    <section id="generator" className="relative scroll-mt-24 bg-background py-16 lg:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={reduce ? undefined : { opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-24 top-0 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,hsl(168_100%_17%/0.08),transparent_65%)] blur-3xl"
        />
        <div className="absolute -left-24 bottom-0 h-[20rem] w-[20rem] rounded-full bg-[radial-gradient(circle,hsl(168_60%_45%/0.06),transparent_65%)] blur-3xl" />
      </div>

      <div className="container relative mx-auto max-w-[1200px] px-6 sm:px-8">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* ---------- copy ---------- */}
          <div>
            <Reveal>
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Solution · The engine inside
              </p>
              <h2 className="relative mt-3 font-display text-[clamp(3.2rem,8vw,6.5rem)] font-normal italic leading-[0.9] text-foreground">
                Mantha
              </h2>
              <p className="mt-4 max-w-[26ch] font-display text-[clamp(1.35rem,2.1vw,1.7rem)] font-medium leading-[1.25] text-foreground">
                What is Mantha? The AI that reads your room like a decorator.
              </p>
            </Reveal>

            <Reveal delay={0.12} className="mt-6 grid max-w-[52ch] gap-4 text-[16.5px] leading-relaxed text-foreground/62">
              <p>
                Mantha looks at your photo the way a designer would: it finds the walls, the floor,
                the direction of the light and where the shadows fall. Then it changes only the
                surfaces you choose.
              </p>
              <p>
                Your sofa stays your sofa. The window light stays where it was. What changes is the
                paint, the paper or the boards underfoot, drawn in the right perspective so it looks
                like it was always there.
              </p>
            </Reveal>

            <Stagger className="mt-7 flex flex-wrap gap-2">
              {CAPABILITIES.map((c) => (
                <motion.li
                  key={c}
                  variants={staggerItem}
                  className="list-none rounded-full bg-card px-3.5 py-2 font-label text-[13.5px] font-bold text-foreground shadow-[inset_0_0_0_1px_hsl(168_20%_88%)]"
                >
                  {c}
                </motion.li>
              ))}
            </Stagger>
          </div>

          {/* ---------- interactive demo card ---------- */}
          <Reveal delay={0.15} y={24}>
            <div className="rounded-[26px] border border-foreground/[0.1] bg-card p-4 shadow-[0_30px_80px_-40px_hsl(168_30%_15%/0.25)]">
              <div
                ref={boxRef}
                onMouseMove={(e) => draggingSeam.current && setFromEvent(e.clientX)}
                onMouseUp={() => { draggingSeam.current = false; }}
                onMouseLeave={() => { draggingSeam.current = false; }}
                onTouchMove={(e) => draggingSeam.current && setFromEvent(e.touches[0].clientX)}
                onTouchEnd={() => { draggingSeam.current = false; }}
                className="relative aspect-[4/3] select-none overflow-hidden rounded-[18px] bg-[hsl(168_28%_96%)]"
              >
                {/* base photo — always present underneath every phase */}
                <img
                  src={beforeImage}
                  alt={uploaded ? 'Your uploaded room' : 'Example empty room, ready for a redesign'}
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                />

                {/* ---------- idle: upload affordance ---------- */}
                <AnimatePresence>
                  {phase === 'idle' && (
                    <motion.label
                      key="drop"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
                      onDrop={(e) => { e.preventDefault(); setDragging(false); showFile(e.dataTransfer.files[0]); }}
                      className={cn(
                        'absolute inset-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-white/50 bg-[linear-gradient(180deg,rgba(0,20,17,0.15),rgba(0,20,17,0.55))] text-center backdrop-blur-[1px] transition-colors',
                        dragging && 'border-[#8FE3D4] bg-[linear-gradient(180deg,rgba(0,89,78,0.35),rgba(0,52,45,0.7))]',
                      )}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="absolute inset-0 z-10 cursor-pointer opacity-0"
                        onChange={(e) => showFile(e.target.files?.[0])}
                      />
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-foreground shadow-lg">
                        <Upload className="h-[18px] w-[18px]" strokeWidth={2} />
                      </span>
                      <b className="font-display text-[21px] font-medium leading-[1.1] text-white">
                        {uploaded ? `${uploaded.name} is ready` : 'Upload your image'}
                      </b>
                      <span className="max-w-[26ch] text-[13px] text-white/75">
                        {uploaded ? 'Tap Start recreating below.' : 'Drop a photo here, or tap to choose one.'}
                      </span>
                      {!uploaded && (
                        <ol className="mt-1 grid gap-0.5 text-[12px] text-white/60">
                          {STEPS.map((s) => <li key={s}>{s}</li>)}
                        </ol>
                      )}
                    </motion.label>
                  )}
                </AnimatePresence>

                {/* ---------- generating: Mantha "thinking" (real request in flight — duration unknown, so the bar loops rather than timing to a fixed length) ---------- */}
                <AnimatePresence>
                  {phase === 'generating' && (
                    <motion.div
                      key="generating"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden bg-[#00231D]/60 backdrop-blur-[3px]"
                    >
                      <motion.div
                        aria-hidden
                        animate={{ y: ['-100%', '420%'] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                        className="pointer-events-none absolute inset-x-0 h-1/4 bg-[linear-gradient(180deg,transparent,rgba(143,227,212,0.4),transparent)]"
                      />
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                        className="h-12 w-12 rounded-full border-2 border-white/20 border-t-[#8FE3D4]"
                      />
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={statusIndex}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.25 }}
                          className="flex items-center gap-1.5 font-label text-[11px] font-bold uppercase tracking-[0.16em] text-[#8FE3D4]"
                        >
                          <Sparkles className="h-3 w-3" />
                          {STATUS_LINES[statusIndex]}
                        </motion.span>
                      </AnimatePresence>
                      <span className="text-[11.5px] text-white/70">
                        {elapsed}s · usually about 10 seconds
                      </span>
                      <div className="h-1 w-32 overflow-hidden rounded-full bg-white/15">
                        <motion.div
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                          className="h-full w-1/2 rounded-full bg-[#8FE3D4]"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ---------- used: free try already spent on this device ---------- */}
                {phase === 'used' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#00231D]/75 px-6 text-center backdrop-blur-[3px]"
                  >
                    <Sparkles className="h-6 w-6 text-[#8FE3D4]" />
                    <p className="font-display text-[19px] font-medium text-white">You've used your free preview</p>
                    <p className="max-w-[30ch] text-[13px] text-white/70">Sign up for unlimited redesigns of your own rooms.</p>
                  </motion.div>
                )}

                {/* ---------- result: before / after slider on the real generated image ---------- */}
                {phase === 'result' && resultImage && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0"
                  >
                    <div
                      style={{ clipPath: `polygon(${split}% 0, 100% 0, 100% 100%, ${split}% 100%)` }}
                      className="absolute inset-0"
                    >
                      <img
                        src={resultImage}
                        alt="Your Mantha redesign"
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

                    <div
                      className="pointer-events-none absolute inset-y-0 w-[3px] bg-white shadow-[0_0_18px_rgba(0,0,0,0.5)]"
                      style={{ left: `${split}%` }}
                    />
                    <motion.button
                      type="button"
                      aria-label="Drag to compare before and after"
                      onMouseDown={(e) => { e.preventDefault(); draggingSeam.current = true; setHinted(false); }}
                      onTouchStart={() => { draggingSeam.current = true; setHinted(false); }}
                      animate={hinted ? { left: [`${split}%`, `${split - 10}%`, `${split + 10}%`, `${split}%`] } : undefined}
                      transition={{ duration: 1.3, ease: 'easeInOut' }}
                      className="absolute top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition-transform hover:scale-110 active:scale-95"
                      style={!hinted ? { left: `${split}%` } : undefined}
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                    </motion.button>

                    <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1.5 font-label text-[10.5px] font-medium uppercase tracking-[0.08em] text-white">
                      {uploaded ? 'Your photo' : 'Before'}
                    </span>
                    <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-primary/90 px-3 py-1.5 font-label text-[10.5px] font-medium uppercase tracking-[0.08em] text-primary-foreground">
                      Your redesign
                    </span>
                  </motion.div>
                )}
              </div>

              {phase === 'idle' && uploaded && (
                <div className="mt-3">
                  <label htmlFor="demo-prompt" className="sr-only">Describe the style you want</label>
                  <textarea
                    id="demo-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={2}
                    placeholder="Optional: describe the style, e.g. warm Scandinavian, oak floors"
                    className="block w-full resize-none rounded-xl border border-foreground/25 bg-white px-3.5 py-3 text-base leading-snug text-foreground shadow-sm outline-none placeholder:text-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/25 sm:text-[14px]"
                  />
                </div>
              )}

              {error && (
                <p className="mt-3 text-center text-[12.5px] text-destructive">{error}</p>
              )}

              {/* ---------- footer control ---------- */}
              <AnimatePresence mode="wait" initial={false}>
                {phase === 'idle' || phase === 'generating' ? (
                  <motion.div
                    key="start"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <motion.button
                      type="button"
                      onClick={start}
                      disabled={phase === 'generating'}
                      whileHover={phase === 'idle' ? { scale: 1.01 } : undefined}
                      whileTap={phase === 'idle' ? { scale: 0.99 } : undefined}
                      className="group mt-3.5 flex w-full items-center justify-between rounded-full bg-foreground py-2 pl-6 pr-2 text-background transition-colors disabled:cursor-wait hover:enabled:bg-primary"
                    >
                      <span className="text-left">
                        <span className="block font-label text-[16.5px] font-bold">
                          {phase === 'generating' ? 'Redesigning…' : 'Start recreating'}
                        </span>
                        <span className="block text-[12px] text-background/60">
                          {phase === 'generating' ? 'Mantha is working on it' : 'See a before / after in seconds'}
                        </span>
                      </span>
                      <span className="relative flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-full bg-background/15">
                        <ArrowRight className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-7" />
                        <ArrowRight className="absolute h-4 w-4 -translate-x-7 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0" />
                      </span>
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="result-actions"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="mt-3.5 flex items-center gap-2"
                  >
                    {phase === 'result' && (
                      <button
                        type="button"
                        onClick={reset}
                        className="flex items-center gap-2 rounded-full px-4 py-2.5 font-label text-[13.5px] font-bold text-foreground shadow-[inset_0_0_0_1.5px_hsl(168_20%_85%)] transition-colors hover:bg-[hsl(168_28%_96%)]"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Try another photo
                      </button>
                    )}
                    <Link
                      to="/signup"
                      className="group flex flex-1 items-center justify-between rounded-full bg-primary py-2 pl-5 pr-2 text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <span className="font-label text-[14px] font-bold">Get your real redesign</span>
                      <span className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-white/15">
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-6" />
                        <ArrowRight className="absolute h-3.5 w-3.5 -translate-x-6 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0" />
                      </span>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>

              <p className="mt-3 text-center font-label text-[11.5px] text-muted-foreground">
                One free redesign per visitor · sign up for unlimited redesigns
              </p>
            </div>
          </Reveal>
        </div>

        {/* ---------- templates grid ---------- */}
        <Stagger className="mt-16 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:mt-20 lg:gap-5" gap={0.06}>
          <motion.li variants={staggerItem} className="col-span-2 flex list-none flex-col justify-center gap-2.5 pr-2 sm:col-span-4 lg:col-span-1">
            <h3 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-medium leading-[1] text-foreground">
              <em className="italic text-primary">Templates</em>
            </h3>
            <p className="text-[14.5px] text-foreground/58">
              A template is a finished look: colours, finish and flooring chosen to work
              together. Tap one and Mantha transforms your room in a single click.
            </p>
          </motion.li>

          {TEMPLATE_GRID.map((t) => (
            <motion.li key={t.key} variants={staggerItem} className="list-none">
              <Link
                to="/signup"
                aria-label={`Apply ${t.label} template`}
                className="group relative block aspect-[4/4.4] overflow-hidden rounded-[18px] bg-foreground"
              >
                <img
                  src={t.image}
                  alt={t.alt}
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(0,52,45,0.85))]" />
                <span className="pointer-events-none absolute right-3 top-3 flex gap-1">
                  {t.swatches.map((c) => (
                    <i key={c} style={{ background: c }} className="h-3.5 w-3.5 rounded-full shadow-[0_0_0_1.5px_rgba(255,255,255,0.9)]" />
                  ))}
                </span>
                <span className="pointer-events-none absolute inset-x-3.5 bottom-3.5">
                  <span className="block font-label text-[10.5px] uppercase tracking-[0.08em] text-[#8FE3D4]">{t.tag}</span>
                  <b className="block font-display text-[19px] font-medium leading-[1.1] text-white">{t.label}</b>
                </span>
              </Link>
            </motion.li>
          ))}

          <motion.li variants={staggerItem} className="col-span-2 flex list-none flex-col justify-center gap-2.5 pr-2 sm:col-span-4 lg:col-span-1">
            <h3 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-medium leading-[1] text-foreground">
              Tried it<em className="italic text-primary">?</em>
            </h3>
            <p className="text-[14.5px] text-foreground/58">
              Pick a template above, or mix your own from any paint, paper and floor in the
              catalogue, and keep it for the next room.
            </p>
          </motion.li>

          <motion.li variants={staggerItem} className="list-none">
            <Link
              to="/signup"
              aria-label="Create your own template"
              className="group relative block aspect-[4/4.4] overflow-hidden rounded-[18px] bg-[hsl(28_30%_30%)]"
            >
              <img src="/assets/rooms/t-own.jpg" alt="" className="h-full w-full object-cover opacity-35 grayscale transition-opacity duration-500 group-hover:opacity-45" />
              <span className="pointer-events-none absolute left-3.5 top-3.5 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[22px] leading-none text-primary-foreground">+</span>
              <span className="pointer-events-none absolute inset-x-3.5 bottom-3.5">
                <span className="block font-label text-[10.5px] uppercase tracking-[0.08em] text-[#8FE3D4]">Your mix</span>
                <b className="block font-display text-[17px] font-medium leading-[1.15] text-white">Create your own template</b>
              </span>
            </Link>
          </motion.li>
        </Stagger>
      </div>
    </section>
  );
}
