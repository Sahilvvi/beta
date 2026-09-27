import { useEffect, useMemo, useRef, useState } from 'react';
import { isActiveSubscription, useSubscription } from '@/hooks/useProfile';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight, Check, Crosshair, Download, ExternalLink, ImagePlus, Loader2, Mic, MicOff, RefreshCw, Sparkles, Wand2, X,
} from 'lucide-react';

import { SEO } from '@/components/shared/SEO';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useAuthStore } from '@/stores/authStore';
import { StoredCompare, StoredImage } from '@/components/app/StoredImage';
import { ShopThisLook } from '@/components/app/ShopThisLook';
import { MaskCanvas, type MaskCanvasHandle } from '@/components/app/MaskCanvas';
import {
  GenerationError, IS_PLACEHOLDER_GENERATOR, OutOfCreditsError, RateLimitError,
  downloadStoredImage, fileNameFor, isSetupError, labelMaskRegion, type Generation,
  useCreditBalance, useGenerate, useStoredImageUrl,
} from '@/lib/generation';
import {
  DEFAULT_TEMPLATE_KEY, ROOM_TYPES, TEMPLATES, type RoomType, roomLabel, templateByKey,
} from '@/lib/templates';
import { useProducts, searchProductsForPrompt, MAX_PRODUCTS_PER_GENERATION, type Product } from '@/lib/products';
import { BudgetFilter, MoreLikeThis, ProductTile } from '@/components/app/ProductPicker';
import { consumePendingRemix } from '@/lib/remix';

/** How long to wait after the last keystroke before searching for real products matching the prompt. */
const PROMPT_PRODUCT_DEBOUNCE_MS = 700;
/** Roughly 3 rows at the side panel's usual ~4 columns, before "View more" kicks in. */
const INITIAL_VISIBLE_PRODUCTS = 12;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The photo in the composer: a new local file, or one already stored (refining/regenerating). */
type SourceImage = { kind: 'file'; file: File; preview: string } | { kind: 'stored'; path: string };

interface Turn {
  id: string;
  sourceRef: string;
  templateKey: string;
  roomType: RoomType;
  prompt: string;
  status: 'pending' | 'done' | 'error';
  result?: Generation;
  error?: string;
  attempt: number;
  productIds?: string[];
}

interface PrefillState {
  inputPath?: string;
  templateKey?: string | null;
  roomType?: RoomType | null;
  prompt?: string | null;
}

const refOf = (s: SourceImage) => (s.kind === 'file' ? s.preview : s.path);

export default function Create() {
  const { user } = useAuthStore();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const prefill = (location.state as PrefillState | null) ?? null;
  // A style "remixed" from a public share page (/r/<slug>) — carried via
  // sessionStorage so it survives a sign-in/sign-up detour. Read (and
  // cleared) exactly once, on first render.
  const pendingRemix = useRef(consumePendingRemix()).current;

  const { data: credits, isLoading: creditsLoading, error: creditsError } = useCreditBalance();
  const generate = useGenerate();

  const [source, setSource] = useState<SourceImage | null>(
    prefill?.inputPath ? { kind: 'stored', path: prefill.inputPath } : null,
  );
  const [templateKey, setTemplateKey] = useState(
    templateByKey(searchParams.get('template'))?.key
      ?? templateByKey(prefill?.templateKey)?.key
      ?? templateByKey(pendingRemix?.templateKey)?.key
      ?? DEFAULT_TEMPLATE_KEY,
  );
  const [roomType, setRoomType] = useState<RoomType>(prefill?.roomType ?? pendingRemix?.roomType ?? 'living');
  const [prompt, setPrompt] = useState(prefill?.prompt ?? pendingRemix?.prompt ?? '');

  useEffect(() => {
    if (pendingRemix) toast.message('Style loaded from a shared design — upload your photo to try it.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [refineText, setRefineText] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const budget = useMemo(() => ({
    minPrice: budgetMin ? Number(budgetMin) : undefined,
    maxPrice: budgetMax ? Number(budgetMax) : undefined,
  }), [budgetMin, budgetMax]);
  const { data: catalogProducts } = useProducts(roomType, undefined, budget);
  const [promptProducts, setPromptProducts] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const promptSearchId = useRef(0);

  // "Mark an object" — an optional paint step on the uploaded photo (same
  // mechanism as Replace's mask) used only to ask Gemini what's under the
  // paint, never sent to the redesign call itself: Create has no mask
  // channel, it's a full-room restyle, so the stroke is purely a way to
  // point at something and get real matches for it without typing.
  const [markMode, setMarkMode] = useState(false);
  const [markStrokeCount, setMarkStrokeCount] = useState(0);
  const [markedLabel, setMarkedLabel] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const markCanvasRef = useRef<MaskCanvasHandle>(null);
  const markRequestId = useRef(0);
  const markTimer = useRef<number | null>(null);
  const sourceRef = source ? refOf(source) : undefined;
  const resolvedSourceUrl = useStoredImageUrl(sourceRef);

  useEffect(() => {
    if (markTimer.current) window.clearTimeout(markTimer.current);
    if (!markMode || markStrokeCount === 0) {
      markRequestId.current += 1;
      setMarkedLabel(null);
      setMarking(false);
      return;
    }
    const myId = ++markRequestId.current;
    setMarking(true);
    markTimer.current = window.setTimeout(async () => {
      try {
        const detection = await markCanvasRef.current?.exportDetection({ maxDimension: 768 });
        if (!detection || myId !== markRequestId.current) return;
        const detected = await labelMaskRegion(detection.blob, detection.box);
        if (myId === markRequestId.current) setMarkedLabel(detected || null);
      } catch {
        if (myId === markRequestId.current) setMarkedLabel(null);
      } finally {
        if (myId === markRequestId.current) setMarking(false);
      }
    }, PROMPT_PRODUCT_DEBOUNCE_MS);
    return () => { if (markTimer.current) window.clearTimeout(markTimer.current); };
  }, [markStrokeCount, markMode]);

  const exitMarkMode = () => {
    setMarkMode(false);
    setMarkStrokeCount(0);
    setMarkedLabel(null);
    markCanvasRef.current?.clear();
  };

  // As the prompt is typed, surface real products matching what it describes
  // ("a green velvet sofa"); if nothing's typed but something's been marked
  // on the photo, use that detection instead — see supabase/functions/search-products.
  const usingMarkedLabel = prompt.trim().length < 4 && !!markedLabel;
  const activeQuery = prompt.trim().length >= 4 ? prompt.trim() : (markedLabel ?? '');
  const hasActiveQuery = activeQuery.length >= 4;
  useEffect(() => {
    const typed = prompt.trim();
    const query = typed.length >= 4 ? typed : (markedLabel ?? '');
    if (query.length < 4) {
      promptSearchId.current += 1;
      setPromptProducts([]);
      setSearchingProducts(false);
      return;
    }
    const myId = ++promptSearchId.current;
    setSearchingProducts(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchProductsForPrompt({ prompt: query, roomType, ...budget });
        if (myId === promptSearchId.current) setPromptProducts(results);
      } catch {
        if (myId === promptSearchId.current) setPromptProducts([]);
      } finally {
        if (myId === promptSearchId.current) setSearchingProducts(false);
      }
    }, PROMPT_PRODUCT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [prompt, markedLabel, roomType, budget]);

  // Only fall back to the generic room-type catalog when there's no active
  // search at all — a search that *did* run and came up empty (e.g. "bowl",
  // which isn't furniture) must never silently substitute unrelated sofas
  // and beds; that looked like "detection is right but products are wrong."
  const productChoices = hasActiveQuery ? promptProducts : (catalogProducts ?? []);

  const [lastPicked, setLastPicked] = useState<Product | null>(null);
  const toggleProduct = (product: Product) => {
    if (selectedProductIds.includes(product.id)) {
      setSelectedProductIds((prev) => prev.filter((p) => p !== product.id));
      if (lastPicked?.id === product.id) setLastPicked(null);
      return;
    }
    if (selectedProductIds.length >= MAX_PRODUCTS_PER_GENERATION) {
      toast.error(`Up to ${MAX_PRODUCTS_PER_GENERATION} products per design for now.`);
      return;
    }
    setSelectedProductIds((prev) => [...prev, product.id]);
    setLastPicked(product);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const voice = useVoiceInput({
    onResult: (text) => setPrompt((prev) => (prev ? `${prev} ${text}` : text)),
    onError: (message) => toast.error(message),
  });

  const setupPending = isSetupError(creditsError);
  const outOfCredits = credits !== undefined && credits <= 0;
  const { data: subscription } = useSubscription();
  const subscribed = isActiveSubscription(subscription);
  const busy = turns.some((t) => t.status === 'pending');
  const canSend = !!source && !busy && !creditsLoading && !outOfCredits && !setupPending;

  const filePreview = source?.kind === 'file' ? source.preview : null;
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview); }, [filePreview]);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please choose a JPG, PNG or WebP photo.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('That photo is over 10MB — please use a smaller one.');
      return;
    }
    setSource({ kind: 'file', file, preview: URL.createObjectURL(file) });
    setMarkMode(false);
    setMarkStrokeCount(0);
    setMarkedLabel(null);
  };

  const run = async (args: {
    userId: string;
    image: File | string;
    sourceRef: string;
    templateKey: string;
    roomType: RoomType;
    prompt: string;
    attempt: number;
    restorePromptOnError?: boolean;
    productIds?: string[];
    mode?: 'refine';
  }) => {
    const id = crypto.randomUUID();
    setTurns((prev) => [
      ...prev,
      {
        id,
        sourceRef: args.sourceRef,
        templateKey: args.templateKey,
        roomType: args.roomType,
        prompt: args.prompt,
        status: 'pending',
        attempt: args.attempt,
        productIds: args.productIds,
      },
    ]);

    try {
      const result = await generate.mutateAsync({
        userId: args.userId,
        image: args.image,
        templateKey: args.templateKey,
        roomType: args.roomType,
        prompt: args.prompt,
        attempt: args.attempt,
        productIds: args.productIds,
        mode: args.mode,
      });
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'done', result, sourceRef: result.input_image_url } : t)),
      );
      setSource({ kind: 'stored', path: result.input_image_url });
    } catch (err) {
      const message =
        err instanceof OutOfCreditsError
          ? "You're out of credits."
          : err instanceof RateLimitError || err instanceof GenerationError
            ? err.message
            : isSetupError(err)
              ? "Generation isn't switched on yet — the latest database update still needs to be applied."
              : 'Something went wrong generating that design. No worries — try again.';
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'error', error: message } : t)));
      if (args.restorePromptOnError && args.prompt) setPrompt((current) => current || args.prompt);
    }
  };

  const send = () => {
    if (!user || !source || !canSend) return;
    run({
      userId: user.id,
      image: source.kind === 'file' ? source.file : source.path,
      sourceRef: refOf(source),
      templateKey,
      roomType,
      prompt: prompt.trim(),
      attempt: 0,
      restorePromptOnError: true,
      productIds: selectedProductIds.length ? selectedProductIds : undefined,
    });
    setPrompt('');
  };

  const regenerate = (turn: Turn) => {
    if (!user || !turn.result || busy || outOfCredits) return;
    run({
      userId: user.id,
      image: turn.result.input_image_url,
      sourceRef: turn.result.input_image_url,
      templateKey: turn.templateKey,
      roomType: turn.roomType,
      prompt: turn.prompt,
      attempt: turn.attempt + 1,
      productIds: turn.productIds,
    });
  };

  /** A conversational follow-up on an already-generated result — "make the
   *  sofa darker" — without re-uploading or re-describing the whole room.
   *  Builds on the OUTPUT (not the original photo) and asks for one small
   *  targeted change; see generate-redesign's "refine" mode. */
  const refine = (turn: Turn, text: string) => {
    if (!user || !turn.result || busy || outOfCredits || !text.trim()) return;
    run({
      userId: user.id,
      image: turn.result.output_image_url ?? turn.result.input_image_url,
      sourceRef: turn.result.output_image_url ?? turn.result.input_image_url,
      templateKey: turn.templateKey,
      roomType: turn.roomType,
      prompt: text.trim(),
      attempt: turn.attempt + 1,
      productIds: turn.productIds,
      mode: 'refine',
    });
  };

  const selectedTemplate = useMemo(() => templateByKey(templateKey), [templateKey]);

  return (
    <>
      <SEO title="Create | Think Decor" description="Redesign a room with Mantha AI." />

      <section className="panel">
        <div className="ph">
          <div className="r">
            <div className="kicker">Tools · Create</div>
            <h1>What are we <em>redesigning</em>?</h1>
            <p className="sub">Upload a room, choose a style, and tell Mantha what to change.</p>
          </div>
          {credits !== undefined && (
            <div className="actions r" style={{ ['--i' as string]: 1 }}>
              <span className="credpill">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
                <b>{credits}</b> credits left · 1 per design
              </span>
            </div>
          )}
        </div>

        {IS_PLACEHOLDER_GENERATOR && (
          <div className="note r" style={{ ['--i' as string]: 2 }}>
            <div className="ic">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg>
            </div>
            <div><b>Preview mode.</b> Results are sample designs while Mantha's live generation is being connected. Credits, history and your projects all work as they will at launch.</div>
          </div>
        )}

        {setupPending && (
          <div className="note r" style={{ ['--i' as string]: 2 }}>
            <div className="ic">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg>
            </div>
            <div>Creating switches on once the latest database update is applied.</div>
          </div>
        )}

        {/* Past turns */}
        {turns.length > 0 && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {turns.map((turn) => (
              <div key={turn.id} className="turn-card">
                <div className="turn-media">
                  {turn.status === 'pending' && (
                    <div className="turn-wait">
                      <StoredImage src={turn.sourceRef} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(6px)', opacity: 0.6 }} />
                      <div className="turn-wait-in">
                        <Loader2 className="spin" color="var(--brass)" width={28} height={28} />
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>Redesigning your room…</span>
                      </div>
                    </div>
                  )}
                  {turn.status === 'done' && turn.result && (
                    <>
                      <StoredCompare before={turn.result.input_image_url} after={turn.result.output_image_url} generationId={turn.result.id} />
                      <div style={{ marginTop: 12 }}><ShopThisLook generationId={turn.result.id} /></div>
                    </>
                  )}
                  {turn.status === 'error' && (
                    <div className="note" style={{ margin: 0, background: 'var(--rose-bg)', boxShadow: 'inset 0 0 0 1px #F3D3CB', color: '#7A2E20' }}>
                      <div>
                        {turn.error}
                        {outOfCredits && !subscribed && <Link to="/pricing" style={{ marginLeft: 6, fontWeight: 700, color: 'var(--brass)' }}>See plans</Link>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="turn-side">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="tagp">{templateByKey(turn.templateKey)?.label}</span>
                    <span className="tagp">{roomLabel(turn.roomType)}</span>
                    {turn.attempt > 0 && <span className="tagp">Variation {turn.attempt + 1}</span>}
                  </div>
                  {turn.prompt && (
                    <div>
                      <div className="kicker" style={{ marginBottom: 6 }}>Your brief</div>
                      <p className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>{turn.prompt}</p>
                    </div>
                  )}

                  {turn.status === 'pending' && (
                    <p className="muted" style={{ fontSize: 13 }}>Usually about ten seconds. You can leave this page open.</p>
                  )}

                  {turn.status === 'done' && turn.result && (
                    <div className="turn-acts">
                      <span className="muted" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Check width={14} height={14} color="var(--brass)" />
                        Saved to your <Link to="/app/library" style={{ fontWeight: 700, color: 'var(--brass)' }}>projects</Link>
                      </span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => regenerate(turn)} disabled={busy || outOfCredits} className="btn btn-line btn-sm">
                          <RefreshCw width={14} height={14} /> Regenerate
                        </button>
                        <button
                          type="button"
                          onClick={() => turn.result?.output_image_url && downloadStoredImage(turn.result.output_image_url, fileNameFor(turn.result.output_image_url, `thinkdecor-${turn.result.id.slice(0, 8)}`))}
                          className="btn btn-dark btn-sm"
                        >
                          <Download width={14} height={14} /> Download
                        </button>
                      </div>
                      <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={refineText[turn.id] ?? ''}
                          onChange={(e) => setRefineText((prev) => ({ ...prev, [turn.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !busy && !outOfCredits) {
                              refine(turn, refineText[turn.id] ?? '');
                              setRefineText((prev) => ({ ...prev, [turn.id]: '' }));
                            }
                          }}
                          placeholder="One more change — e.g. Make the sofa darker"
                          disabled={busy || outOfCredits}
                          className="field"
                          style={{ flex: 1, height: 38, paddingInline: 12, fontSize: 13.5 }}
                        />
                        <button
                          type="button"
                          disabled={busy || outOfCredits || !(refineText[turn.id] ?? '').trim()}
                          onClick={() => {
                            refine(turn, refineText[turn.id] ?? '');
                            setRefineText((prev) => ({ ...prev, [turn.id]: '' }));
                          }}
                          className="btn btn-line btn-sm"
                        >
                          <Sparkles width={14} height={14} /> Refine
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="ws">
          <div
            className="drop r"
            style={{ ['--i' as string]: 3 }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
          >
            {dragging && (
              <svg className="ants"><rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="21" ry="21" /></svg>
            )}
            {source && markMode ? (
              <div style={{ width: '100%', maxWidth: 420 }}>
                <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                  Circle a sofa, bed, or anything else — Mantha will find real matches for it. This won't change the photo itself.
                </p>
                {resolvedSourceUrl && (
                  <MaskCanvas
                    ref={markCanvasRef}
                    imageSrc={resolvedSourceUrl}
                    onStrokeCountChange={setMarkStrokeCount}
                  />
                )}
                {(marking || markedLabel) && (
                  <span className="tagp dark" style={{ marginTop: 10, display: 'inline-flex' }}>
                    {marking ? (
                      <><Loader2 className="animate-spin" width={13} height={13} /> Detecting…</>
                    ) : (
                      <><Sparkles width={13} height={13} /> Looks like: <b>{markedLabel}</b></>
                    )}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button type="button" className="btn btn-line" onClick={exitMarkMode}>
                    <X width={14} height={14} /> Done marking
                  </button>
                </div>
              </div>
            ) : source ? (
              <>
                <div style={{ position: 'relative', width: '100%', maxWidth: 420, borderRadius: 18, overflow: 'hidden' }}>
                  <StoredImage src={refOf(source)} alt="Selected room" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover' }} />
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-line" onClick={() => { setSource(null); exitMarkMode(); }}>Choose a different photo</button>
                  <button type="button" className="btn btn-line" onClick={() => setMarkMode(true)}>
                    <Crosshair width={14} height={14} /> Mark an object to find matches
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="big">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="4" /></svg>
                </div>
                <h3>Drop a room photo, <em>or tap to choose</em></h3>
                <p>Straight-on and in daylight works best. Get two walls and the floor in frame so Mantha can read the room.</p>
                <div className="acts">
                  <button type="button" className="btn btn-dark" onClick={() => fileInputRef.current?.click()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>Choose a photo
                  </button>
                </div>
                <div className="fmt">
                  <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>JPG or PNG</span>
                  <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2" /></svg>One room per photo</span>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>

          <aside className="side2">
            <div className="box r" style={{ ['--i' as string]: 4 }}>
              <h5><span className="n">1</span>Style<small>{selectedTemplate?.label}</small></h5>
              <div className="styles">
                {TEMPLATES.map((t) => (
                  <div key={t.key} className={`st${templateKey === t.key ? ' on' : ''}`} onClick={() => setTemplateKey(t.key)}>
                    <img src={t.image} alt="" />
                    <span>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="box r" style={{ ['--i' as string]: 5 }}>
              <h5><span className="n">2</span>Room type</h5>
              <div className="rooms">
                {ROOM_TYPES.map((r) => (
                  <button key={r.key} type="button" className={`pchip${roomType === r.key ? ' on' : ''}`} onClick={() => setRoomType(r.key)}>{r.label}</button>
                ))}
              </div>
            </div>
            {(!!productChoices.length || searchingProducts || catalogProducts !== undefined) && (
              <div className="box r" style={{ ['--i' as string]: 6 }}>
                <h5>
                  <span className="n">3</span>
                  {usingMarkedLabel ? `Matching what you marked (${markedLabel})` : hasActiveQuery ? 'Matching your prompt' : 'Real products'}
                  <small>optional · up to {MAX_PRODUCTS_PER_GENERATION}</small>
                </h5>
                <BudgetFilter min={budgetMin} max={budgetMax} onChange={(a, b) => { setBudgetMin(a); setBudgetMax(b); }} />
                {searchingProducts && productChoices.length === 0 && (
                  <p className="muted" style={{ fontSize: 12 }}>Looking for real products…</p>
                )}
                {!searchingProducts && productChoices.length === 0 && hasActiveQuery && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    No real products found for "{activeQuery}" yet — try describing it differently, or clear it to browse by room type.
                  </p>
                )}
                {!searchingProducts && productChoices.length === 0 && !hasActiveQuery && (
                  <p className="muted" style={{ fontSize: 12 }}>Nothing in that budget — try widening it.</p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 8 }}>
                  {(showAllProducts ? productChoices : productChoices.slice(0, INITIAL_VISIBLE_PRODUCTS)).map((p) => (
                    <ProductTile key={p.id} product={p} selected={selectedProductIds.includes(p.id)} onToggle={() => toggleProduct(p)} />
                  ))}
                </div>
                {productChoices.length > INITIAL_VISIBLE_PRODUCTS && (
                  <button
                    type="button"
                    className="lnk"
                    style={{ marginTop: 8, fontSize: 12.5 }}
                    onClick={() => setShowAllProducts((s) => !s)}
                  >
                    {showAllProducts ? 'View fewer' : `View more (${productChoices.length - INITIAL_VISIBLE_PRODUCTS})`}
                  </button>
                )}
                {selectedProductIds.length > 0 && (
                  <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    {selectedProductIds.length} selected — these exact products will appear in the design.
                  </p>
                )}
                {lastPicked && (
                  <MoreLikeThis
                    product={lastPicked}
                    selectedIds={selectedProductIds}
                    onToggle={toggleProduct}
                  />
                )}
              </div>
            )}
          </aside>
        </div>

        <div className="comp r" style={{ ['--i' as string]: 7 }}>
          <div className="top1">
            <span className="kicker" style={{ fontSize: 10 }}>{productChoices.length || searchingProducts || catalogProducts !== undefined ? '4' : '3'} · Describe it</span>
            <span className="sel"><img src={selectedTemplate?.image} alt="" />{selectedTemplate?.label}</span>
            <span className="sel">{roomLabel(roomType)}</span>
          </div>
          <div className="ta">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              placeholder="Keep my sofa, swap the rug for something softer and add warmer lighting…"
            />
          </div>
          <div className="bot">
            {['Warmer lighting', 'Oak floor', 'Keep my furniture', 'Add plants'].map((s) => (
              <button key={s} type="button" className="sug" onClick={() => setPrompt((p) => (p ? `${p}, ${s.toLowerCase()}` : s))}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>{s}
              </button>
            ))}
            <span className="cost">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
              Uses <b>1</b> of your {credits ?? '—'} credits
            </span>
            {voice.supported && (
              <button
                type="button"
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
                className="ico-btn"
                aria-label={voice.listening ? 'Stop voice input' : 'Describe changes by voice'}
                style={voice.listening ? { color: 'var(--rose)' } : undefined}
              >
                {voice.listening ? <MicOff width={16} height={16} /> : <Mic width={16} height={16} />}
              </button>
            )}
            <button type="button" onClick={send} disabled={!canSend} className={`go${canSend ? ' ready' : ''}`}>
              {!source && <span className="tt">Add a room photo to begin</span>}
              {busy ? <Loader2 className="animate-spin" width={15} height={15} /> : <Wand2 width={15} height={15} />}
              Redesign
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
