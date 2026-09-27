import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const W = 1080;
const H = 1920;

// Timeline, seconds.
const T_BEFORE_IN = 0.25;
const T_BEFORE_HOLD = 1.5;
const T_WIPE = 0.6;
const T_AFTER_HOLD = 2.0;
const T_OUTRO = 1.1;
const T_WIPE_START = T_BEFORE_IN + T_BEFORE_HOLD;
const T_WIPE_END = T_WIPE_START + T_WIPE;
const T_AFTER_END = T_WIPE_END + T_AFTER_HOLD;
const TOTAL = T_AFTER_END + T_OUTRO;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Loads via fetch + createImageBitmap rather than `new Image()` —
 *  HTMLImageElement's decode-and-fire-onload pipeline is tied to the
 *  document's rendering lifecycle and silently never fires while the tab is
 *  hidden/backgrounded (verified directly: an onload handler never ran after
 *  10+s on a hidden document). fetch()/createImageBitmap() aren't part of
 *  that pipeline and complete normally regardless of visibility — exactly
 *  the condition a "make a reel to go share elsewhere" flow invites. */
async function loadImage(src: string): Promise<ImageBitmap> {
  const res = await fetch(src);
  if (!res.ok) throw new Error('Could not load image');
  const blob = await res.blob();
  return createImageBitmap(blob);
}

/** Draws `img` centered in a WxH box, cropped ("cover") to fill it. */
function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pillLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, dark: boolean) {
  ctx.font = '700 30px "Plus Jakarta Sans", sans-serif';
  const padX = 30;
  const textW = ctx.measureText(text).width;
  const w = textW + padX * 2;
  const h = 62;
  roundedRectPath(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = dark ? 'rgba(15,31,29,.78)' : 'rgba(242,248,247,.94)';
  ctx.fill();
  ctx.fillStyle = dark ? '#F2F8F7' : '#00332C';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 2);
}

interface ReelGeneratorProps {
  open: boolean;
  onClose: () => void;
  beforeUrl?: string | null;
  afterUrl?: string | null;
  label: string;
}

/** Records a short, vertical, branded before/after clip straight from a
 *  canvas — no server render, just canvas.captureStream() + MediaRecorder,
 *  so it's instant and free to generate on every share. */
export function ReelGenerator({ open, onClose, beforeUrl, afterUrl, label }: ReelGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'idle' | 'recording' | 'done' | 'error'>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [progress, setProgress] = useState(0);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!open || !beforeUrl || !afterUrl) return;
    let cancelled = false;
    stopRef.current = false;
    setStatus('recording');
    setProgress(0);
    setVideoUrl(null);
    setVideoBlob(null);

    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let before: ImageBitmap;
      let after: ImageBitmap;
      let mark: ImageBitmap | null = null;
      try {
        [before, after] = await Promise.all([loadImage(beforeUrl), loadImage(afterUrl)]);
        mark = await loadImage('/logo.png').catch(() => null);
        if ('fonts' in document) await document.fonts.ready;
      } catch {
        if (!cancelled) setStatus('error');
        return;
      }
      if (cancelled) return;

      // captureStream(0) = manual mode: no automatic per-frame capture tied to
      // the compositor, which (like rAF and image decode) is suspended for a
      // hidden document — an automatic-mode stream verified to produce only a
      // few dozen bytes of real video data there. Push each frame explicitly
      // with track.requestFrame() right after drawing it instead.
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
      recorder.start();

      const start = performance.now();
      const tick = () => {
        if (stopRef.current || cancelled) { clearInterval(intervalId); if (recorder.state !== 'inactive') recorder.stop(); return; }
        const t = (performance.now() - start) / 1000;
        setProgress(Math.min(1, t / TOTAL));

        ctx.fillStyle = '#00332C';
        ctx.fillRect(0, 0, W, H);

        if (t < T_WIPE_START) {
          drawCover(ctx, before, 0, 0, W, H);
        } else if (t < T_WIPE_END) {
          const k = easeInOutCubic((t - T_WIPE_START) / T_WIPE);
          const wipeY = H * k;
          drawCover(ctx, before, 0, 0, W, H);
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, W, wipeY);
          ctx.clip();
          drawCover(ctx, after, 0, 0, W, H);
          ctx.restore();
          ctx.fillStyle = '#8FE3D4';
          ctx.fillRect(0, Math.max(0, wipeY - 4), W, 8);
        } else if (t < T_AFTER_END) {
          drawCover(ctx, after, 0, 0, W, H);
        } else {
          drawCover(ctx, after, 0, 0, W, H);
          const k = Math.min(1, (t - T_AFTER_END) / 0.35);
          ctx.fillStyle = `rgba(6,32,28,${0.86 * k})`;
          ctx.fillRect(0, 0, W, H);
        }

        // Fade in "Before" / current label.
        const introK = Math.min(1, t / T_BEFORE_IN);
        if (t < T_WIPE_START) {
          ctx.globalAlpha = introK;
          pillLabel(ctx, 'Before', W / 2, 180, true);
          ctx.globalAlpha = 1;
        } else if (t < T_AFTER_END) {
          pillLabel(ctx, label, W / 2, 180, true);
        }

        // Outro: logo + wordmark + url.
        if (t >= T_AFTER_END) {
          const k = Math.min(1, (t - T_AFTER_END) / 0.4);
          ctx.save();
          ctx.globalAlpha = k;
          ctx.textAlign = 'center';
          if (mark) {
            const s = 140;
            ctx.drawImage(mark, W / 2 - s / 2, H / 2 - 220, s, s);
          }
          ctx.fillStyle = '#F2F8F7';
          ctx.font = '400 84px "Newsreader", serif';
          ctx.fillText('Think Decor', W / 2, H / 2 - 20);
          ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#8FE3D4';
          ctx.fillText('thinkdecor.app', W / 2, H / 2 + 50);
          ctx.restore();
        }

        // Persistent corner brand bug.
        if (mark) {
          ctx.globalAlpha = 0.92;
          ctx.drawImage(mark, W - 90, H - 300, 46, 46);
          ctx.globalAlpha = 1;
        }

        track.requestFrame();
        if (t >= TOTAL) { clearInterval(intervalId); if (recorder.state !== 'inactive') recorder.stop(); return; }
      };
      // Driven by setInterval, not requestAnimationFrame: rAF callbacks are
      // suspended outright for a hidden/backgrounded document in Chrome, and
      // "generate a reel to share elsewhere" is exactly the workflow where a
      // user switches tabs mid-recording. setInterval keeps firing (throttled,
      // not stopped) so the recording still finishes instead of hanging.
      const intervalId = setInterval(tick, 1000 / 30);

      await stopped;
      if (cancelled) return;
      const blob = new Blob(chunks, { type: mimeType });
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setStatus('done');
    })();

    return () => { cancelled = true; stopRef.current = true; };
  }, [open, beforeUrl, afterUrl, label]);

  const download = () => {
    if (!videoBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(videoBlob);
    a.download = 'thinkdecor-reel.webm';
    a.click();
  };

  const share = async () => {
    if (!videoBlob) return;
    const file = new File([videoBlob], 'thinkdecor-reel.webm', { type: videoBlob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My Think Decor redesign' });
      } catch { /* user cancelled the native share sheet — nothing to do */ }
    } else {
      download();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Your before/after reel</DialogTitle>
        <DialogDescription>A vertical clip, ready for Reels, TikTok or Stories.</DialogDescription>

        <div style={{ borderRadius: 20, overflow: 'hidden', background: '#00332C', aspectRatio: `${W} / ${H}`, position: 'relative' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: status === 'done' ? 'none' : 'block' }} />
          {status === 'done' && videoUrl && (
            <video src={videoUrl} controls loop autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          {status === 'recording' && (
            <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, height: 5, borderRadius: 999, background: 'rgba(255,255,255,.25)', overflow: 'hidden' }}>
              <div style={{ width: `${progress * 100}%`, height: '100%', background: '#8FE3D4', transition: 'width .1s linear' }} />
            </div>
          )}
        </div>

        {status === 'error' && (
          <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>Couldn't generate the reel — try again.</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" className="btn btn-line" style={{ flex: 1 }} disabled={status !== 'done'} onClick={download}>
            {status === 'recording' ? <Loader2 width={15} height={15} className="spin" /> : <Download width={15} height={15} />}
            Download
          </button>
          <button type="button" className="btn btn-dark" style={{ flex: 1 }} disabled={status !== 'done'} onClick={() => { void share(); }}>
            <Share2 width={15} height={15} /> Share
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
